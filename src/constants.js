export const OUTREACH_STATUSES=['Not Contacted','Contacted','Awaiting Reply','Follow-up Due','Replied','Negotiating','Declined','No Response','Paused','Converted'];
export const COLLABORATION_STAGES=['Confirmed — Awaiting Details','Ready to Fulfill','In Fulfillment','Delivered','Content in Progress','Published','Completed','Closed'];
export const FIT_VERDICTS=['Strong','Maybe','Weak','Reject'];
export const TIERS=['A','B','C'];
export const ACCOUNT_TYPES=['Lifestyle','Fashion / Beauty','Human + Pet','Pet Only'];
export const DOG_SIZES=['Mini','Small','Medium','Large'];
export const RELATIONSHIPS=['New','Active','Repeat Partner','Paused','Do Not Contact'];
export const SHIPMENT_STATUSES=['Draft','Ready','Shipped','Delivered','Exception'];
export const DELIVERABLE_STATUSES=['Pending','Draft Received','Revision Requested','Approved','Published','Cancelled'];
export const PUBLICATION_STATUSES=['Planned','Published','Removed'];
export const RIGHTS_STATUSES=['Not Discussed','Organic Repost Approved','Paid Usage Approved','Declined'];
export const PAYMENT_STATUSES=['Gifted','Quoted','Approved','Paid','Not Approved'];
export const DEFAULT_PAGE_SIZE=50;
export const PAGE_SIZES=[25,50,100];

export const CREATOR_FIELDS=['id','creator_code','display_name','legal_name','nickname','location','timezone','languages','preferred_contact_method','contact_email','contact_phone','preferred_channel','relationship_status','fit_verdict','fit_notes','tier','account_type','appearance','dog_size','source_group','source_detail','followers','owner_id','tags','do_not_contact','notes','database_notes','created_at','updated_at'];

export function badgeClass(value=''){
  const v=String(value).toLowerCase();
  if(v.includes('published')||v.includes('completed')||v.includes('delivered')||v.includes('strong')||v.includes('converted'))return'green';
  if(v.includes('declined')||v.includes('reject')||v.includes('no response')||v.includes('cancelled')||v.includes('closed'))return'rose';
  if(v.includes('follow')||v.includes('await')||v.includes('maybe')||v.includes('negotiat'))return'amber';
  return'';
}
