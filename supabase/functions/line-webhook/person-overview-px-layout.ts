/**
 * PHMS person overview — shared LINE Flex pixel layout.
 * Scope: every person, every household; leaves actions/identity/theming intact.
 * LINE clients determine final rendered pixels. 593 is a conservative estimated
 * budget, never a reason to crop clinical information or hide buttons.
 */
export const PERSON_OVERVIEW_PX = Object.freeze({
  total:593, header:76, padding:12, portrait:96, portraitGap:10,
  rowGap:8, dividerGap:12, footerGap:8, safety:12
});
type Node = Record<string, any>;
const isOverview = (bubble:Node) =>
  bubble?.type === 'bubble' && JSON.stringify(bubble.header?.contents ?? []).includes('ภาพรวมบุคคล');

export function layoutPersonOverviewPx(message:Node, estimateHeight:(node:Node)=>number):Node {
  if(message?.type !== 'flex')return message;
  const bubbles:Node[] = message.contents?.type === 'carousel'
    ? message.contents.contents : message.contents?.type === 'bubble' ? [message.contents] : [];
  for(const card of bubbles){
    if(!isOverview(card) || card.body?.type !== 'box')continue;
    const h=card.header, b=card.body, f=card.footer;
    if(h?.type==='box'){
      h.height='76px';h.paddingAll='10px';h.paddingStart='18px';
      h.paddingEnd='18px';h.spacing='6px';
    }
    b.layout='vertical';b.paddingAll='12px';b.spacing='0px';
    delete b.height;delete b.minHeight;delete b.flex;
    for(const item of b.contents??[]){
      if(item?.type==='box'&&item.layout==='horizontal'){
        const children:Node[]=item.contents??[];
        const photo=children.find(x=>x?.type==='box'&&x.contents?.some((n:Node)=>n.type==='image'));
        const info=children.find(x=>x!==photo&&x?.type==='box'&&x.contents?.some((n:Node)=>n.type==='text'));
        if(photo&&info){
          photo.width='96px';photo.height='96px';photo.flex=0;
          for(const x of photo.contents)if(x.type==='image'){
            x.size='96px';x.aspectRatio='1:1';x.aspectMode='cover';x.flex=0;
          }
          info.flex=1;info.spacing='4px';
          item.spacing='10px';item.alignItems='center';item.margin='0px';
        }
      }
      if(item?.type==='box'&&JSON.stringify(item).includes('ผู้ดูแลหลัก')){
        item.margin='8px';item.paddingTop='6px';item.paddingBottom='6px';
        item.paddingStart='10px';item.paddingEnd='10px';
      }
      if(item?.type==='box'&&JSON.stringify(item).includes('เรื่องที่ควรติดตาม')){
        item.margin='8px';item.paddingAll='10px';item.spacing='6px';
        for(const x of item.contents??[])if(x.type==='text')x.margin='0px';
      }
      if(item?.type==='separator')item.margin='12px';
      if(item?.type==='text'&&String(item.text??'').includes('ปัดซ้าย'))item.margin='10px';
    }
    if(f?.type==='box'){
      f.paddingAll='12px';f.spacing='8px';
      delete f.height;delete f.minHeight;delete f.flex;
      for(const btn of f.contents??[])if(btn.type==='button'){
        btn.height='md';btn.margin='0px';
      }
    }
    // PHMS_PERSON_OVERVIEW_COMPACT_593_V2: avoid dynamic body stretching.
    // Use an explicit fixed height for a balanced 593px carousel while retaining
    // the existing two actions. Values are LINE Flex px, not CSS classes.
    delete b.height; // Never force the overview to stretch to 310px.
    b.paddingAll='8px';
    b.spacing='0px';
    if(f?.type==='box'){
      f.paddingAll='6px';f.spacing='4px';
      for(const btn of f.contents??[])if(btn.type==='button'){
        btn.height='md';btn.margin='0px';
      }
    }
    const predicted=PERSON_OVERVIEW_PX.header+estimateHeight(b)+estimateHeight(f)+PERSON_OVERVIEW_PX.safety;
    // Never force a fixed height when text varies. The upstream carousel budget
    // must paginate information cards before rendering if this exceeds 593.
    if(predicted>PERSON_OVERVIEW_PX.total)
      console.warn('phms_person_overview_over_budget',{predicted});
  }
  return message;
}

