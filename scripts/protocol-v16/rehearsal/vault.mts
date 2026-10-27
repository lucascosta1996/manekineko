import {createCipheriv,createDecipheriv,randomBytes} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import {Wallet} from 'ethers';
import {privateRead} from '../../protocol-v12/rehearsal/store.mts';
const aad=Buffer.from('tincta-v16-sepolia-rehearsal-501-wallets');
function key(value:string){if(!/^[a-f0-9]{64}$/i.test(value))throw new Error('A private 32-byte V16 vault key is required.');return Buffer.from(value,'hex');}
export async function createVault(path:string,secret:string){
 const wallets=Array.from({length:501},()=>Wallet.createRandom());
 const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key(secret),iv);cipher.setAAD(aad);
 const data=Buffer.concat([cipher.update(JSON.stringify(wallets.map(w=>w.privateKey)), 'utf8'),cipher.final()]);
 await writeFile(path,JSON.stringify({version:16,chainId:11155111,iv:iv.toString('hex'),tag:cipher.getAuthTag().toString('hex'),data:data.toString('hex')})+'\n',{mode:0o600,flag:'wx'});
 return wallets.map(w=>w.address);
}
export async function readVault(path:string,secret:string){
 const v=JSON.parse(await privateRead(path));if(v.version!==16||v.chainId!==11155111)throw new Error('Wrong wallet vault version.');
 const d=createDecipheriv('aes-256-gcm',key(secret),Buffer.from(v.iv,'hex'));d.setAAD(aad);d.setAuthTag(Buffer.from(v.tag,'hex'));
 const keys=JSON.parse(Buffer.concat([d.update(Buffer.from(v.data,'hex')),d.final()]).toString());
 if(!Array.isArray(keys)||keys.length!==501)throw new Error('Invalid wallet vault.');
 const wallets=keys.map(k=>new Wallet(k));if(new Set(wallets.map(w=>w.address)).size!==501)throw new Error('Duplicate wallet.');return wallets;
}
export async function exportWallet(directory:string,wallet:Wallet){
 await mkdir(directory,{recursive:true,mode:0o700});
 try{const saved=await privateRead(directory+'/wallet.json'),password=(await privateRead(directory+'/password.txt')).trim(),restored=await Wallet.fromEncryptedJson(saved,password);if(restored.address!==wallet.address)throw new Error('Existing handoff belongs to another wallet.');return{address:wallet.address,keystore:directory+'/wallet.json',passwordFile:directory+'/password.txt',privateKeyFile:directory+'/private-key.txt'};}catch(e:any){if(e.code!=='ENOENT')throw e;}
 const password=randomBytes(24).toString('base64url');
 await writeFile(directory+'/wallet.json',await wallet.encrypt(password),{mode:0o600,flag:'wx'});
 await writeFile(directory+'/password.txt',password+'\n',{mode:0o600,flag:'wx'});
 await writeFile(directory+'/private-key.txt',wallet.privateKey+'\n',{mode:0o600,flag:'wx'});
 return{address:wallet.address,keystore:directory+'/wallet.json',passwordFile:directory+'/password.txt',privateKeyFile:directory+'/private-key.txt'};
}
