// publicRoom exposes only name, universe, rarity and cost during auction.
// Resolve decorative portraits from those public names, never a full hidden roster.
export function createAuctionTeamPortraitLoader({fetch:fetchArt=globalThis.fetch}={}){
 const requests=new Map();
 return function loadAuctionTeamPortraits(root){
  return Promise.all([...root.querySelectorAll('.side-hero-portrait')].map(async img=>{
   const {heroName:name,heroUniverse:universe}=img.dataset;
   if(!name||!universe)return;
   const key=JSON.stringify([universe,name]);
   // Cache in-flight, successful and failed requests. Routine room polling must
   // not refetch the same acquired cards or repeatedly retry unavailable art.
   if(!requests.has(key))requests.set(key,Promise.resolve()
    .then(()=>fetchArt('/api/art?universe='+encodeURIComponent(universe)+'&name='+encodeURIComponent(name)))
    .then(response=>response.ok?response.json():null)
    .then(data=>typeof data?.url==='string'&&data.url?data.url:null)
    .catch(()=>null));
   const url=await requests.get(key);
   if(!img.isConnected)return;
   if(!url){img.dataset.portraitState='missing';return;}
   img.onerror=()=>{img.dataset.portraitState='missing';img.removeAttribute('src');};
   img.src=url;
  }));
 };
}
