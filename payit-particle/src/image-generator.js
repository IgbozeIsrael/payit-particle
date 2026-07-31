const { renderInvoiceImage } = require('./invoice-renderer');

/**
 * Invoice image service.
 * Uses deterministic SVG rendering so amounts and wallet addresses are exact.
 */
class ImageGenerator {
  async generateInvoiceVisual(invoiceData) {
    console.log(`[Invoice] Rendering invoice image for ${invoiceData.invoiceId}`);
    const imageBuffer = await renderInvoiceImage(invoiceData);
    return {
      success: true,
      imageBuffer
    };
  }
}

module.exports = new ImageGenerator();
