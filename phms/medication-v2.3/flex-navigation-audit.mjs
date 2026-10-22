/** PHMS v2.3 LINE Flex back-button checks. No new theme/colors/font tokens. */
import { MED_ROUTES } from "./navigation-registry.mjs";
export function checkMedicationNavigation(routeKey, context) {
  const route = MED_ROUTES[routeKey];
  if (!route) return {ok:false,reason:"UNKNOWN_ROUTE"};
  if (!context?.permissionChecked || !context?.personChecked || !context?.familyChecked) return {ok:false,reason:"AUTHORIZATION_REQUIRED"};
  return {ok:true,back:route.back,screen:route.screen};
}
export function auditFlexBackButtons(flex, isBackAction) {
  const errors=[];
  const bubbles=flex?.type==="carousel"?flex.contents: [flex?.type==="flex"?flex.contents:flex];
  for (let bi=0;bi<bubbles.length;bi++){
    const bubble=bubbles[bi];let backs=[];
    function visit(node,path){
      if (!node||typeof node!=="object") return;
      if(Array.isArray(node)){node.forEach((x,i)=>visit(x,path+"."+i));return;}
      if(node.action&&isBackAction(node.action)) {
        backs.push({node,path});
        if(node.type!=="box" || node.height!=="44px") errors.push({bubble:bi,path,reason:"BACK_NOT_44PX_BOX"});
      }
      for(const [k,v] of Object.entries(node))if(k!=="action")visit(v,path+"."+k);
    }
    visit(bubble,"bubble");
    if(backs.length>1)errors.push({bubble:bi,reason:"DUPLICATE_BACK"});
    // Carousel exception: back is allowed only on initial bubble.
    if(bi>0&&backs.length>0)errors.push({bubble:bi,reason:"BACK_ON_NONFIRST_CAROUSEL"});
  }
  return {ok:errors.length===0,errors};
}
