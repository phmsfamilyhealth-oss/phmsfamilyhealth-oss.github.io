import {assertEquals,assert} from "jsr:@std/assert@1.0.14";
import {layoutPersonOverviewPx,PERSON_OVERVIEW_PX} from "./person-overview-px-layout.ts";
const measure=(x:any)=>Number.parseInt(String(x?.height??"0"),10)||0;
Deno.test("global: all family overview bubbles receive identical px spacing without modifying actions",()=>{
 const person=(name:string)=>({
  type:"bubble",header:{type:"box",contents:[{type:"text",text:"👤 ภาพรวมบุคคล"},{type:"text",text:name}]},
  body:{type:"box",height:"340px",contents:[{type:"box",layout:"horizontal",contents:[
   {type:"box",contents:[{type:"image",url:"https://example.invalid/test.png",size:"96px"}]},
   {type:"box",contents:[{type:"text",text:name}]}
  ]},{type:"separator"}]},
  footer:{type:"box",contents:[{type:"button",action:{type:"postback",data:"รายละเอียดบุคคล",label:"ดูรายละเอียด"}}]}
 });
 const m:any={type:"flex",contents:{type:"carousel",contents:[person("ยายปุ"),person("ตาไตรภพ")]}};
 layoutPersonOverviewPx(m,measure);
 for(const c of m.contents.contents){
  assertEquals(c.header.height,"76px");assertEquals(c.body.paddingAll,"12px");
  assertEquals(c.body.contents[0].spacing,"10px");assertEquals(c.body.contents[1].margin,"12px");
  assertEquals(c.footer.spacing,"8px");assertEquals(c.footer.contents[0].action.data,"รายละเอียดบุคคล");
  assert(!("height" in c.body));
 }
 assertEquals(PERSON_OVERVIEW_PX.total,593);
});
Deno.test("do not touch unrelated medication summary",()=>{
 const m:any={type:"flex",contents:{type:"bubble",header:{type:"box",contents:[{type:"text",text:"💊 ยา"}]},body:{type:"box",height:"340px"}}};
 layoutPersonOverviewPx(m,measure);
 assertEquals(m.contents.body.height,"340px");
});
