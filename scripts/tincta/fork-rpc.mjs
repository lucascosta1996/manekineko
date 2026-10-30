/** Loopback-only transport for a disposable fork. No signing or write RPCs. */
import http from 'node:http';
import { FetchRequest, JsonRpcProvider } from 'ethers';
const request=new FetchRequest('https://eth.drpc.org');request.timeout=20000;
const provider=new JsonRpcProvider(request,1,{batchMaxCount:1,cacheTimeout:-1,staticNetwork:true});
const allowed=new Set(['eth_chainId','net_version','eth_blockNumber','eth_getBlockByNumber','eth_getBlockByHash','eth_getCode','eth_getStorageAt','eth_getTransactionCount','eth_getBalance','eth_call','eth_getTransactionReceipt','eth_getLogs','eth_getTransactionByHash','eth_feeHistory','eth_gasPrice','eth_getProof']);
let queue=Promise.resolve();
const server=http.createServer(async(req,res)=>{
 if(req.method!=='POST'){res.writeHead(405).end();return;}
 let body='';for await(const chunk of req){body+=chunk;if(body.length>1000000){res.writeHead(413).end();return;}}
 try{
  const input=JSON.parse(body);
  async function read(q){
   if(!allowed.has(q.method))return{jsonrpc:'2.0',id:q.id,error:{code:-32601,message:'Read-only fork transport'}};
   try{const pending=queue.then(()=>provider.send(q.method,q.params??[]));queue=pending.catch(()=>{});return{jsonrpc:'2.0',id:q.id,result:await pending}}catch{
    console.error('Mainnet read unavailable:',q.method);return{jsonrpc:'2.0',id:q.id,error:{code:-32000,message:'Mainnet read unavailable'}};
   }
  }
  res.setHeader('Content-Type','application/json');res.end(JSON.stringify(Array.isArray(input)?await Promise.all(input.map(read)):await read(input)));
 }catch{res.writeHead(400).end();}
});
server.listen(18547,'127.0.0.1',()=>console.log('Read-only Mainnet fork transport ready on loopback port 18547'));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{server.close();provider.destroy();process.exit(0)});
