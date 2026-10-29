"use client";
/** Only the isolated visual app imports this synthetic account context. No signer exists. */
import {useState} from 'react';
import {Button} from '@manekineko/ui/button';
import {SharedWalletContext} from '@manekineko/protocol/use-wallet-session';
import {WalletProfile} from '../components/wallet-profile';
import {SiteShell} from '../components/site-shell';
export function WalletProfileFixture({state}:{state:string}){
  const [account,setAccount]=useState<{address:string;chainId:number}|null>(state==='disconnected'?null:{address:'0x'+'2'.repeat(40),chainId:11155111});
  return <SharedWalletContext.Provider value={{managed:true,connecting:false,account,session:null,pickerChain:null,notice:'',connect:()=>{},closePicker:()=>{},openAccount:()=>{},disconnect:()=>setAccount(null),openPicker:()=>setAccount({address:'0x'+'2'.repeat(40),chainId:11155111}),switchNetwork:chainId=>setAccount(account?{...account,chainId}:null)}}>
    <SiteShell section="wallet" chainId={11155111}><div aria-label="Isolated fixture controls"><Button variant="secondary" onClick={()=>setAccount({address:'0x'+'3'.repeat(40),chainId:11155111})}>Use another fixture wallet</Button><Button variant="secondary" onClick={()=>setAccount(null)}>Disconnect fixture wallet</Button></div><WalletProfile chainId={11155111} contract={'0x'+'1'.repeat(40)}/></SiteShell>
  </SharedWalletContext.Provider>;
}
