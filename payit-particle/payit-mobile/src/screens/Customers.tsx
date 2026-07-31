import React from 'react';
import { ArrowLeft } from 'lucide-react';
import { GreenBtn } from '../components/Buttons'; // Adjust import path as needed

export default function CustomersScreen({ onBack, token }: { onBack: () => void; token: string | null }) {
  return (
    <div className="flex-1 flex flex-col px-5 overflow-hidden">
      <div className="flex items-center gap-3 px-4 pt-2 pb-3 shrink-0">
        <button onClick={onBack} className="w-9 h-9 rounded-[12px] bg-white border border-[#E5E7EB] flex items-center justify-center shadow-sm">
          <ArrowLeft size={17} strokeWidth={2.2} />
        </button>
        <span className="text-[17px] font-bold text-[#0F172A]">Customers</span>
      </div>
      <div className="flex-1 flex flex-col items-center justify-center">
        <p className="text-[#64748B]">Customer management UI will be implemented here.</p>
        {/* Placeholder actions */}
        <GreenBtn label="Add Customer" onClick={() => alert('Add Customer action')} />
      </div>
    </div>
  );
}
