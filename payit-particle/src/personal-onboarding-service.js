const db = require('./db');
const nuvionService = require('./nuvion-service');
const { encryptSystemKey, decryptSystemKey } = require('./wallet');
const crypto = require('crypto');

const FEATURE_FLAG = process.env.KYC_ONBOARDING_ENABLED !== 'false';
const SANDBOX = process.env.NUVION_ENV === 'sandbox';
const NUVION_BASE = process.env.NUVION_BASE_URL || (SANDBOX ? 'https://api.nuvion.dev' : 'https://api.nuvion.dev');

class PersonalOnboardingService {
  saveOnboardingDraft(profileId, partialFields) {
    if (!FEATURE_FLAG) throw new Error('KYC onboarding is currently disabled');
    if (!profileId) throw new Error('profile_id is required');
    return db.saveOnboardingDraft(profileId, 'personal', partialFields);
  }

  validateReadyForSubmission(profileId) {
    const profile = db.getProfile(profileId);
    if (!profile || profile.type !== 'personal') {
      return ['Profile not found or not a personal profile'];
    }
    const missing = [];
    if (!profile.first_name || profile.first_name.trim().length < 2) missing.push('first_name');
    if (!profile.last_name || profile.last_name.trim().length < 2) missing.push('last_name');
    if (!profile.date_of_birth) missing.push('date_of_birth');
    if (!profile.contact_email) missing.push('contact_email');
    if (!profile.nationality) missing.push('nationality');
    if (!profile.gender) missing.push('gender');
    if (!profile.phone_number) missing.push('phone_number');
    if (!profile.bvn) missing.push('bvn');
    if (!profile.nin) missing.push('nin');
    if (!profile.address_line_1) missing.push('address_line_1');
    if (!profile.address_city) missing.push('address_city');
    if (!profile.address_state) missing.push('address_state');
    if (!profile.address_postal_code) missing.push('address_postal_code');
    if (!profile.address_country_code) missing.push('address_country_code');

    const docs = db.getKycDocuments(profileId);
    const hasIdentityDoc = docs.some(d => d.doc_key === 'identity' && d.status === 'uploaded');
    const hasAddressDoc = docs.some(d => d.doc_key === 'address' && d.status === 'uploaded');
    if (!hasIdentityDoc) missing.push('identity_document');
    if (!hasAddressDoc) missing.push('address_document');

    return missing;
  }

  async createNuvionEntity(profileId) {
    if (!FEATURE_FLAG) throw new Error('KYC onboarding is currently disabled');
    const profile = db.getProfile(profileId);
    if (!profile || profile.type !== 'personal') {
      throw new Error('Profile not found or not a personal profile');
    }
    const entityId = profile.nuvion_entity_id || profile.nuvion_person_id;
    if (!SANDBOX && entityId) {
      return { entity_id: entityId, already_exists: true };
    }

    const idempotencyKey = `kyc_individual_${profileId}_${crypto.randomBytes(8).toString('hex')}`;
    const payload = {
      name: `${profile.first_name || ''} ${profile.last_name || ''}`.trim(),
      person: {
        first_name: profile.first_name,
        last_name: profile.last_name,
        email: profile.contact_email || `${profile.user_id}@payit.app`,
        nationality: profile.nationality,
        bvn: profile.bvn,
        date_of_birth: profile.date_of_birth,
        gender: profile.gender,
        phonenumber: profile.phone_number,
        nin: profile.nin,
      },
      address: {
        line_1: profile.address_line_1,
        line_2: profile.address_line_2 || '',
        city: profile.address_city,
        state: profile.address_state,
        postal_code: profile.address_postal_code,
        country_code: profile.address_country_code,
      },
      meta: {
        platform_user_id: profile.user_id,
        context: 'personal',
      }
    };

    try {
      const entity = await nuvionService.requestNuvionWithFallback('/individual-entities', 'POST', payload);
      const resEntityId = entity?.id || entity?.data?.id;
      if (!resEntityId) throw new Error('Nuvion did not return entity id');
      await dbPg.query('UPDATE profiles SET nuvion_entity_id = ?, verification_status = ? WHERE profile_id = ?', [resEntityId, 'pending', profileId]);
      return { entity_id: resEntityId, already_exists: false };
    } catch (err) {
      const requestId = err.headers?.['x-request-id'] || null;
      console.error(`[KYC Onboarding] createNuvionEntity failed for ${profileId}`, err.message, requestId ? `X-Request-ID: ${requestId}` : '');
      throw err;
    }
  }

  async uploadDocument(profileId, docKey, fileBase64) {
    if (!FEATURE_FLAG) throw new Error('KYC onboarding is currently disabled');
    if (!['identity', 'address'].includes(docKey)) {
      throw new Error(`Invalid doc_key: ${docKey}. Must be 'identity' or 'address'`);
    }
    const profile = await dbPg.getProfile(profileId);
    const personaId = profile?.nuvion_entity_id || profile?.nuvion_person_id;
    if (!profile || !personaId) {
      throw new Error('Profile not found or entity not created yet — createNuvionEntity must be called first');
    }

    const personId = personaId;
    const payload = {
      entity_id: personaId,
      key: docKey,
      description: `${docKey} document for ${profile.first_name || 'user'} ${profile.last_name || ''}`.trim(),
      file: fileBase64,
      meta: { file_type: 'application/pdf' },
      link_to_identity: { person_id: personId }
    };

    try {
      const result = await nuvionService.requestNuvionWithFallback('/documents', 'POST', payload);
      const docId = result?.id || result?.data?.id;
      db.saveKycDocument(profileId, docId, docKey, 'uploaded');
      return { document_id: docId, status: 'uploaded' };
    } catch (err) {
      const requestId = err.headers?.['x-request-id'] || null;
      console.error(`[KYC Onboarding] uploadDocument failed for ${profileId} key=${docKey}`, err.message, requestId ? `X-Request-ID: ${requestId}` : '');
      db.saveKycDocument(profileId, null, docKey, 'failed');
      throw err;
    }
  }

  async submitForVerification(profileId) {
    if (!FEATURE_FLAG) throw new Error('KYC onboarding is currently disabled');
    const missing = this.validateReadyForSubmission(profileId);
    if (missing.length > 0) {
      throw new Error(`Cannot submit — missing: ${missing.join(', ')}`);
    }
    const profile = db.getProfile(profileId);
    const entityId = profile.nuvion_person_id;
    if (!entityId) {
      throw new Error('No Nuvion entity created — call createNuvionEntity first');
    }
    const docs = db.getKycDocuments(profileId);
    const hasIdentity = docs.some(d => d.doc_key === 'identity' && d.status === 'uploaded');
    const hasAddress = docs.some(d => d.doc_key === 'address' && d.status === 'uploaded');
    if (!hasIdentity || !hasAddress) {
      throw new Error('Both identity and address documents must be uploaded before submission');
    }

    const idempotencyKey = `kyc_submit_${profileId}_${crypto.randomBytes(4).toString('hex')}`;
    try {
      await nuvionService.requestNuvionWithFallback('/onboarding-submissions', 'POST', { entity_id: entityId });
      db.updateVerificationStatus(profileId, 'pending');
      return { submitted: true, profile_id: profileId };
    } catch (err) {
      const requestId = err.headers?.['x-request-id'] || null;
      console.error(`[KYC Onboarding] submitForVerification failed for ${profileId}`, err.message, requestId ? `X-Request-ID: ${requestId}` : '');
      throw err;
    }
  }

  handleRejection(profileId, reasons) {
    const parsedReasons = typeof reasons === 'string' ? JSON.parse(reasons) : reasons;
    const status = 'rejected';
    db.updateVerificationStatus(profileId, status, JSON.stringify(parsedReasons));
    const profile = db.getProfile(profileId);
    console.log(`[KYC Onboarding] Profile ${profileId} rejected: ${JSON.stringify(parsedReasons)}`);
    return { status, rejection_reasons: parsedReasons, profile_id: profileId };
  }
}

module.exports = new PersonalOnboardingService();
