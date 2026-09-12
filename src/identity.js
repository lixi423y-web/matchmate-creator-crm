// One identity rule for add, search, account edits and CSV import.
export function instagramHandle(value){
  let text=String(value||'').trim();
  if(/^(?:https?:\/\/|(?:www\.|m\.)?instagram\.com\/)/i.test(text)){
    try{
      const url=new URL(/^https?:\/\//i.test(text)?text:`https://${text}`);
      if(url.username||url.password||url.port||!['instagram.com','www.instagram.com','m.instagram.com'].includes(url.hostname.toLowerCase()))return'';
      const parts=url.pathname.split('/').filter(Boolean);
      if(parts.length!==1)return'';
      text=parts[0];
    }catch{return''}
  }else text=text.replace(/^@/,'');
  text=text.toLowerCase();
  return /^[a-z0-9._]{1,30}$/.test(text)&&!['p','reel','reels','stories','explore','direct','accounts','share'].includes(text)?text:'';
}
export function accountKey(account){
  const platform=String(account.platform||'Instagram').trim().toLowerCase();
  const handle=platform==='instagram'?instagramHandle(account.handle||account.profile_url):String(account.handle||'').trim().replace(/^@/,'').toLowerCase();
  return handle?`${platform}|${handle}`:'';
}
export function validateInstagramAccount(account){
  const handle=instagramHandle(account.handle||account.profile_url);
  if(!handle)throw new Error('Enter a valid Instagram profile URL or @handle.');
  if(account.profile_url&&instagramHandle(account.profile_url)!==handle)throw new Error('Instagram Handle and Profile URL must identify the same account.');
  return handle;
}
export function creatorSearch(value){
  const text=String(value||'').trim();
  return /^(?:@|https?:\/\/|(?:www\.|m\.)?instagram\.com\/)/i.test(text)?instagramHandle(text)||text:text;
}
