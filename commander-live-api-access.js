// Production access is unlocked only for an authenticated room's current live match.
export function isLiveCommanderApiAvailable({apiEnabled=false,previewGuestMode=false,activeMatchKey=null,currentMatchKey=null}={}){
 return apiEnabled||previewGuestMode||Boolean(activeMatchKey&&activeMatchKey===currentMatchKey);
}
