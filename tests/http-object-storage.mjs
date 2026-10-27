import {createServer} from 'node:http';
import {createHmac,randomBytes,createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

// A real isolated HTTP/filesystem object service for transport acceptance.
// It is not Supabase Storage: upstream provider behavior remains a separate gate.
export async function startObjectStorage(){
 const root=await fs.mkdtemp(join(tmpdir(),'phms-storage-'));
 const secret=randomBytes(32),key='synthetic-service',metadata=new Map();let clock=Math.floor(Date.now()/1000);
 const file=path=>join(root,createHash('sha256').update(path).digest('hex'));
 const token=(path,expires)=>createHmac('sha256',secret).update(path+'\n'+expires).digest('hex');
 const server=createServer(async(req,res)=>{
  try{
   const url=new URL(req.url,'http://local.invalid'),prefix='/storage/v1/object/',path=decodeURIComponent(url.pathname.slice(prefix.length));
   const send=(status,data)=>{res.writeHead(status,{'content-type':'application/json'});res.end(JSON.stringify(data));};
   if(!url.pathname.startsWith(prefix))return send(404,{});
   if(req.method==='GET'&&path.startsWith('sign/')){
    const object=path.slice(5),expires=Number(url.searchParams.get('expires'));
    if(!Number.isInteger(expires)||expires<=clock||url.searchParams.get('token')!==token(object,expires))return send(403,{error:'invalid_or_expired_signature'});
    if(!metadata.has(object))return send(404,{});
    res.writeHead(200,{'content-type':metadata.get(object)});res.end(await fs.readFile(file(object)));return;
   }
   if(req.headers.authorization!=='Bearer '+key)return send(401,{error:'unauthorized'});
   const chunks=[];for await(const chunk of req)chunks.push(chunk);const body=Buffer.concat(chunks);
   if(req.method==='POST'&&path.startsWith('sign/')){
    const object=path.slice(5);if(!metadata.has(object))return send(404,{});
    const ttl=Number(JSON.parse(body).expiresIn);if(!Number.isInteger(ttl)||ttl<1||ttl>300)return send(400,{});
    const expires=clock+ttl;return send(200,{signedURL:'/object/sign/'+encodeURI(object)+'?expires='+expires+'&token='+token(object,expires)});
   }
   if(req.method==='POST'&&path.startsWith('phms-medical-sources/persons/')){
    if(metadata.has(path))return send(409,{error:'duplicate_object'});
    await fs.writeFile(file(path),body,{flag:'wx'});metadata.set(path,req.headers['content-type']);return send(200,{Key:path});
   }
   if(req.method==='DELETE'&&path==='phms-medical-sources'){
    for(const name of JSON.parse(body).prefixes){const object=path+'/'+name;await fs.rm(file(object),{force:true});metadata.delete(object);}return send(200,[]);
   }
   return send(404,{});
  }catch(err){res.writeHead(500);res.end(JSON.stringify({error:String(err)}));}
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 return {origin:'http://127.0.0.1:'+server.address().port,get count(){return metadata.size;},advance:seconds=>{clock+=seconds;},close:async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await fs.rm(root,{recursive:true,force:true});}};
}
