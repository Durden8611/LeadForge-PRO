"use client";

import React, { useState, useMemo, useCallback, useEffect, memo } from 'react';
import { createClient } from '../lib/supabase';

const fmt=n=>(n>0?"$"+Math.round(n).toLocaleString():"\u2014");
const fmt2=n=>n>0?"$"+(n/1000).toFixed(0)+"K":"\u2014";
const td=()=>new Date().toLocaleDateString("en-US",{month:"short",day:"numeric"});
const nowT=()=>new Date().toLocaleTimeString("en-US",{hour:"2-digit",minute:"2-digit"});

// EXPANDED PIPELINE: 9 stages per blueprint
const STAGES=["New Lead","Contacted","Appt Set","Offer Made","Contract Signed","Mktg to Buyers","Assigned","Closed","Dead Lead"];
const PLACEHOLDER_NAMES=/^(owner on record|research candidate|recorded owner|unknown|n\/a)$/i;
const SC=["s0","s1","s2","s3","s4","s5","s6","s7","s8"];
const KC=["kc0","kc1","kc2","kc3","kc4","kc5","kc6","kc7","kc8"];

const FP=["$5,000","$8,000","$10,000","$15,000","$20,000","Custom"];
const DO=[{k:"codeViolations",i:"\ud83c\udfe9\ufe0f",l:"Code Violations",s:"Open enforcement notices"},{k:"delinquentTaxes",i:"\ud83d\udccb",l:"Delinquent Taxes",s:"Unpaid taxes / liens"},{k:"neglected",i:"\ud83c\udf3f",l:"Neglected Property",s:"Deteriorated / abandoned"},{k:"preForeclosure",i:"\u26a0\ufe0f",l:"Pre-Foreclosure",s:"90+ days behind"},{k:"probate",i:"\ud83d\udcdc",l:"Probate / Estate",s:"Inherited property"},{k:"absenteeOwner",i:"\ud83c\udfe0",l:"Absentee Owner",s:"Owner lives elsewhere"},{k:"highEquity",i:"\ud83d\udcb0",l:"High Equity",s:"60%+ equity estimated"},{k:"tiredLandlord",i:"\ud83d\ude29",l:"Tired Landlord",s:"Wants out of rental"}];

const TABS=["\ud83d\udd0d Leads","\ud83d\udccb Pipeline","\ud83d\udcc5 Follow-Ups","\ud83c\udfe6 Buyers","\ud83d\udcc4 Contracts","\ud83d\udcca Analytics","\u26a1 Command","\ud83d\udcdd Scripts","\ud83c\udfaf Coach"];
const LEAD_SOURCES=["Cold Call","SMS Campaign","Direct Mail","D4D (Driving)","Website Form","Referral","Skip Trace","Facebook Ad","Google Ad","Bandit Sign","Other"];

// MOTIVATION TAGS per blueprint
const MOTIV_TAGS=[{k:"foreclosure",l:"Foreclosure",c:"fc"},{k:"probate",l:"Probate",c:"pb"},{k:"divorce",l:"Divorce",c:"dv"},{k:"tiredLandlord",l:"Tired Landlord",c:"tl"},{k:"vacant",l:"Vacant",c:"vc"},{k:"taxDelinquent",l:"Tax Delinquent",c:"td"}];

// REHAB CATEGORIES per blueprint
const REHAB_CATS=[{k:"roof",l:"Roof",i:"\ud83c\udfe0",max:15000,def:0},{k:"kitchen",l:"Kitchen",i:"\ud83c\udf73",max:20000,def:0},{k:"bath",l:"Bathrooms",i:"\ud83d\udebf",max:12000,def:0},{k:"flooring",l:"Flooring",i:"\ud83e\uddf1",max:8000,def:0},{k:"paint",l:"Paint/Ext",i:"\ud83c\udfa8",max:6000,def:0},{k:"hvac",l:"HVAC",i:"\u2744\ufe0f",max:10000,def:0},{k:"plumbing",l:"Plumbing",i:"\ud83d\udeb0",max:8000,def:0},{k:"electric",l:"Electrical",i:"\u26a1",max:8000,def:0},{k:"foundation",l:"Foundation",i:"\ud83e\uddf1",max:12000,def:0},{k:"misc",l:"Misc / Other",i:"\ud83d\udee0\ufe0f",max:10000,def:0}];

// Buyers are loaded from API (database) — no hardcoded sample data
const SBUYERS_FALLBACK=[];

const SN={FL:["Palm Ave","Mangrove Ln","Citrus Blvd","Pelican Dr","Sunset Blvd","Gulf Shore Dr","Flamingo Way","Osprey Ct","Manatee Rd","Sawgrass Ln","Cypress Cir","Magnolia St"],TX:["Lone Star Blvd","Bluebonnet Dr","Pecan St","Mesquite Ln","Longhorn Ave","Timber Creek Rd"],CA:["Pacific Ave","Redwood Dr","Golden Gate Blvd","Sunset Ln","Canyon Rd","Eucalyptus St"],NY:["Broadway Ave","Hudson St","Fifth Ave","Riverside Dr","Lexington Blvd"],GA:["Peach Tree Ln","Magnolia Ave","Dogwood Dr"],AZ:["Saguaro Dr","Desert Rose Ln","Palo Verde Blvd"],NC:["Blue Ridge Pkwy","Dogwood Ln","Tobacco Rd"],OH:["Buckeye Ln","Scioto Blvd","Lake Erie Dr"],D:["Oak St","Maple Ave","Cedar Ln","Elm Blvd","Pine Ct","Walnut Dr","Birch Way","Ash Rd","Hickory Blvd","Sycamore Ln"]};

let _tt;function toast(m){const e=document.querySelector('.toast');if(e)e.remove();const d=document.createElement('div');d.className='toast';d.textContent=m;document.body.appendChild(d);clearTimeout(_tt);_tt=setTimeout(()=>d.remove(),2200)}
function cpy(t){navigator.clipboard.writeText(t).then(function(){toast("Copied: "+t.substring(0,50)+(t.length>50?"...":""))})}

function calcD(a,r,f){const A=parseFloat(String(a).replace(/[^0-9.]/g,""))||0,R=parseFloat(String(r).replace(/[^0-9.]/g,""))||0,F=parseFloat(String(f).replace(/[^0-9.]/g,""))||0,m=A*.7-R;return{arv:A,rep:R,fee:F,mao:Math.max(0,m),offer:Math.max(0,m-F),equity:Math.max(0,A-R-m),profit:Math.max(0,m-F),roiPct:A>0?Math.round((F/(m-F||1))*100):0}}

function gAddr(c,s,z,seed){const p=SN[s]||SN.D,n=100+((seed*137+41)%9800),st=p[(seed*3+7)%p.length],zz=z||String(10000+((seed*97+33)%89999));return{street:n+" "+st,city:c||"Unknown",state:s||"FL",zip:zz,full:n+" "+st+", "+(c||"Unknown")+", "+(s||"FL")+" "+zz}}

// AI LEAD SCORING per blueprint: Hot/Warm/Cold
function aScore(l,st){let s=50;if(l.distressed)s+=20;if(l.timeline==="Immediate (0\u201330 days)")s+=18;else if(l.timeline==="30\u201360 days")s+=10;if((l.deal?.equity||0)>80000)s+=12;else if((l.deal?.equity||0)>40000)s+=6;if((l.distressTypes||[]).includes("Pre-Foreclosure"))s+=10;if((l.distressTypes||[]).includes("Tax Delinquent"))s+=8;if((l.motivTags||[]).length>0)s+=5*Math.min(l.motivTags.length,3);if(!l.lastContacted)s+=5;if(l.leadSource==="D4D (Driving)")s+=4;if(l.leadSource==="Referral")s+=6;return Math.round(Math.min(99,Math.max(30,s+((l.score||60)-60)*.3)))}
function heatLabel(sc){return sc>=80?"Hot":sc>=55?"Warm":"Cold"}
function heatCls(sc){return sc>=80?"mtag-hot":sc>=55?"mtag-warm":"mtag-cold"}

// PROPERTY INTELLIGENCE per blueprint (simulated)
function genPropData(arv,seed){
const yb=1960+((seed*17)%55);
const sqft=800+((seed*31+13)%2200);
const assessed=Math.round(arv*.65);
const mortEst=Math.round(arv*.35);
const equityEst=Math.round(assessed-mortEst);
const propType=["SFR","Duplex","Townhome","Condo","SFR","SFR","SFR"][seed%7];
return{yearBuilt:yb,sqft,assessed,mortgageEst:mortEst,equityEst,propType,lotSize:Math.round(3000+((seed*41)%8000))+" sqft",bedBath:["3/2","4/2","2/1","3/3","4/3","5/3"][seed%6]}
}

function genLeads(city,state,zip,lt,pr,cnt,df,dc,ft){
const ac=({FL:"941",TX:"512",CA:"310",NY:"917",GA:"404",AZ:"602",NC:"704",OH:"614"})[state]||"555",fN=parseFloat(String(ft).replace(/[^0-9.]/g,""))||10000;
const fn=["Margaret","David","Sandra","James","Linda","Robert","Patricia","Carlos","Susan","Frank","Angela","Timothy","Brenda","Kevin","Donna","Steven","Sharon","Daniel","Betty","Paul","Grace","Henry","Rita","Oscar"];
const ln=["Torres","Kim","Wilkins","Okafor","Presley","Chen","Nguyen","Mendez","Hartley","Dalton","Moore","Walsh","Fisher","Simmons","Reed","Coleman","Jenkins","Perry","Powell","Flores","Grant","Hayes","Burke","Cross"];
const ar=[city+" Shores","South "+city,city+" Heights","North "+city,city+" Lakes",city+" Estates","West "+city,city+" Gardens","East "+city,city+" Village"];
const mot=[["downsizing","retirement","motivated"],["relocation","must sell fast","flexible"],["divorce","clean title","quick close"],["inherited","estate sale","out-of-state"],["upsizing","growing family","schools"],["investor exit","cash offer ok"],["financial hardship","below market"],["job transfer","quick close"]];
const prp=["3BD/2BA SFR 1,850sf","4BD/2BA pool 2,200sf","2BD/2BA villa 1,400sf","3BD/2BA waterfront 1,950sf","5BD/3BA new 2,800sf","2BD/1BA starter 1,100sf","3BD/2BA corner lot 1,700sf","4BD/3BA den 2,500sf"];
const nts=["Retiring couple, close in 60 days.","Relocating \u2014 needs fast close.","Divorce \u2014 court in 90 days.","Out-of-state heir, remote close.","Needs 4BR, good school zone.","Liquidating portfolio.","Hardship, sell ASAP.","Company transfer."];
const isSel=lt.includes("Seller")||lt.includes("Investor");
const pm={"any price range":[[180,260],[240,320],[300,400],[380,480],[460,560]],"under $300K":[[100,180],[140,220],[170,250],[200,270],[230,290]],"$300K\u2013$600K":[[300,380],[340,420],[390,460],[420,500],[470,550]],"$600K\u2013$1M":[[600,720],[660,780],[720,850],[780,920],[860,970]],"luxury $1M+":[[1000,1300],[1200,1600],[1500,2000],[1900,2600],[2400,3200]]};
const rng=pm[pr]||pm["any price range"],tl=["Immediate (0\u201330 days)","30\u201360 days","60\u201390 days","3\u20136 months","Flexible"],pf=["Phone","Email","Text","Any"];
const leads=Array.from({length:Math.min(cnt,24)},(_,i)=>{
const f=fn[(i*3)%fn.length],l=ln[(i*7+2)%ln.length],tp=lt==="Buyers and Sellers"?(i%3===2?"Investor":i%2===0?"Seller":"Buyer"):isSel?(i%5===4?"Investor":"Seller"):"Buyer";
const[lo,hi]=rng[i%rng.length],arv=(lo+Math.floor((hi-lo)*((i*17+5)%100)/100))*1000,rep=[8000,12000,18000,25000,35000,6000,14000,20000][i%8],addr=gAddr(city,state,zip,i*13+7),ph="("+ac+") "+String(200+i*37).padStart(3,"0")+"-"+String(1000+i*173+47).slice(-4),alt=i%3===0?"("+ac+") "+String(500+i*29).padStart(3,"0")+"-"+String(3000+i*211+83).slice(-4):null;
const src=LEAD_SOURCES[i%LEAD_SOURCES.length];
const mTags=[];if(i%4===0)mTags.push("tiredLandlord");if(i%5===0)mTags.push("vacant");if(i%7===0)mTags.push("divorce");
const propData=genPropData(arv,i*13+7);
return{id:"L"+i+"-"+Date.now(),name:f+" "+l,type:tp,distressed:false,score:63+((i*11+7)%34),area:ar[i%ar.length],propertyAddress:addr.full,propertyStreet:addr.street,propertyCity:addr.city,propertyState:addr.state,propertyZip:addr.zip,phone:ph,altPhone:alt,email:f.toLowerCase()+"."+l.toLowerCase()+"@gmail.com",contactPref:pf[i%pf.length],budget:"$"+(lo*1000).toLocaleString()+"\u2013$"+(hi*1000).toLocaleString(),timeline:tl[i%tl.length],tags:mot[i%mot.length],notes:nts[i%nts.length],property:prp[i%prp.length],arv,repairCost:rep,deal:calcD(arv,rep,fN),stage:"New Lead",distressTypes:[],violations:[],taxOwed:null,userNotes:"",lastContacted:null,contactCount:0,dripDone:[],leadSource:src,motivTags:mTags,propData,activityLog:[{time:nowT(),date:td(),action:"Lead created via "+src}],marketingCost:src==="Direct Mail"?2.50:src==="Facebook Ad"?8.00:src==="Google Ad"?12.00:src==="Skip Trace"?0.15:0};});

if(Object.values(df).some(Boolean)){
const dfn=["Earl","Vivian","Clarence","Mabel","Otis","Loretta","Chester","Norma","Hector","Edna","Roland","Harriet"],dln=["Pruitt","Hamby","Stokes","Tillman","Greer","Pickett","Lowery","Goins","Craft","Spence","Holt","Vickers"];
const da=[city+" \u2014 older subdivision","South "+city+" \u2014 mixed block",city+" Heights \u2014 aging corridor","East "+city+" \u2014 transitional"];
const cv=[["Unsecured structure","Overgrown vegetation","Broken windows"],["Roof deterioration","Inoperable vehicles","Debris"],["Fence collapse","Peeling exterior","Sewage odor"],["Collapsed carport","Pest complaint","Dumping"]];
const txd=[{o:"$4,820",y:"2 yrs",l:"Yes"},{o:"$9,340",y:"3 yrs",l:"Yes"},{o:"$2,150",y:"1 yr",l:"No"},{o:"$14,700",y:"4+ yrs",l:"Yes"}];
const dn=["Absentee owner \u2014 vacant 2+ years.","Multiple code notices.","Probate \u2014 heirs disagree.","Former rental, overextended.","Health issues.","Pre-foreclosure, 90+ days."];
const dp=["3BD/2BA \u2014 deferred maint.","2BD/1BA \u2014 vacant 18mo.","4BD/2BA \u2014 partial rehab","3BD/2BA \u2014 code violations"],aD=[120000,145000,98000,162000,110000,135000],rD=[25000,18000,35000,12000,42000,22000];
const dt=[];if(df.codeViolations)dt.push("Code Violations");if(df.delinquentTaxes)dt.push("Tax Delinquent");if(df.neglected)dt.push("Neglected Property");if(df.preForeclosure)dt.push("Pre-Foreclosure");if(df.probate)dt.push("Probate");if(df.absenteeOwner)dt.push("Absentee Owner");if(df.highEquity)dt.push("High Equity");if(df.tiredLandlord)dt.push("Tired Landlord");
for(let i=0;i<Math.min(dc,dfn.length);i++){const f=dfn[i],l=dln[i],arv=aD[i%aD.length],rep=rD[i%rD.length],addr=gAddr(city,state,zip,i*19+3),ph="("+ac+") "+String(300+i*41).padStart(3,"0")+"-"+String(2000+i*219+31).slice(-4),alt=i%2===0?"("+ac+") "+String(600+i*33).padStart(3,"0")+"-"+String(4000+i*177+61).slice(-4):null;
const mTags=[];if(df.preForeclosure)mTags.push("foreclosure");if(df.probate)mTags.push("probate");if(df.tiredLandlord)mTags.push("tiredLandlord");if(df.delinquentTaxes)mTags.push("taxDelinquent");
const propData=genPropData(arv,i*19+3);
leads.push({id:"D"+i+"-"+Date.now(),name:f+" "+l,type:"Distressed Seller",distressed:true,score:72+((i*9+3)%25),area:da[i%da.length],propertyAddress:addr.full,propertyStreet:addr.street,propertyCity:addr.city,propertyState:addr.state,propertyZip:addr.zip,phone:ph,altPhone:alt,email:f.toLowerCase()+"."+l.toLowerCase()+(50+i*13)+"@gmail.com",contactPref:["Phone","Any","Phone","Text"][i%4],budget:"Below market",timeline:["Immediate (0\u201330 days)","30\u201360 days","Flexible"][i%3],tags:dt.map(d=>d.toLowerCase()),notes:dn[i%dn.length],property:dp[i%dp.length],arv,repairCost:rep,deal:calcD(arv,rep,fN),stage:"New Lead",distressTypes:dt,violations:df.codeViolations?cv[i%cv.length]:[],taxOwed:df.delinquentTaxes?txd[i%txd.length].o:null,taxYears:df.delinquentTaxes?txd[i%txd.length].y:null,taxLien:df.delinquentTaxes?txd[i%txd.length].l:null,userNotes:"",lastContacted:null,contactCount:0,dripDone:[],leadSource:"Skip Trace",motivTags:mTags,propData,activityLog:[{time:nowT(),date:td(),action:"Distressed lead imported via skip trace"}],marketingCost:0.15});}}
return leads;}

function bScript(l,loc,uName,uComp,uPh){
var fn=l.name.split(" ")[0],d=l.deal;
var myN=uName||"[Your Name]",myC=uComp||"[Your Company]",myP=uPh||"[Your Phone]";
var nm=d?.mao>0?"\n\n\ud83d\udcca DEAL NUMBERS\nMAO (70%): "+fmt(d.mao)+"\nOffer to Seller: "+fmt(d.offer)+"\nYour Assignment Fee: "+fmt(d.fee)+"\nBuyer Equity: "+fmt(d.equity)+"\nARV: "+fmt(d.arv)+" | Repairs: "+fmt(l.repairCost):"";
var ad=l.propertyAddress?"\nProperty: "+l.propertyAddress:"";
var propInfo=l.propData?"\nProperty Details: "+(l.propData.propType||"SFR")+" | "+(l.propData.bedBath||"3/2")+" | "+(l.propData.sqft||"?")+" sqft | Built "+(l.propData.yearBuilt||"?"):"";
var contact="\n\n\ud83d\udcde SELLER CONTACT\nName: "+l.name+"\nPhone: "+l.phone+(l.altPhone?" | Alt: "+l.altPhone:"")+"\nEmail: "+l.email+"\nPrefers: "+(l.contactPref||"Any")+"\nTimeline: "+l.timeline;
if(l.distressed){
var distInfo=(l.distressTypes||[]).length>0?"\nDistress Signals: "+(l.distressTypes||[]).join(", "):"";
var taxInfo=l.taxOwed?"\nTax Owed: "+l.taxOwed+" ("+l.taxYears+", Lien: "+l.taxLien+")":"";
return{sc:"\ud83d\udcde DISTRESSED PROPERTY SCRIPT\n\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500"+ad+propInfo+distInfo+taxInfo+"\n\n\ud83c\udfac OPENING:\n\"Hi, is this "+fn+"? Hi "+fn+", my name is "+myN+" with "+myC+". I\u2019m a local real estate investor here in "+loc+". I hope I\u2019m not catching you at a bad time.\"\n\n\ud83d\udde3\ufe0f VALUE PROPOSITION:\n\"I specialize in working with homeowners who have properties that have become difficult to manage \u2014 whether that\u2019s maintenance, tax issues, or just complicated circumstances. Everything I do is completely confidential and there\u2019s zero pressure or obligation.\"\n\n\ud83d\udcb0 THE OFFER:\n\"Here\u2019s what I can do \u2014 I make straightforward cash offers. We buy completely as-is, no repairs needed on your end. We can close in as little as 10 to 14 days, and we handle all the paperwork. No commissions, no fees, no surprises.\"\n\n"+(l.taxOwed?"\ud83e\uddfe TAX SITUATION:\n\"I also want you to know \u2014 the outstanding tax situation of "+l.taxOwed+" doesn\u2019t have to be a barrier. We can typically resolve those as part of the closing process, so that\u2019s one less thing you need to worry about.\"\n\n":"")+"\ud83e\udd1d THE ASK:\n\"Would you be open to a quick 10-minute conversation? Completely confidential, no strings attached. I just want to see if there\u2019s a way I can help.\"\n\n\u2705 IF MOTIVATED:\n\"Perfect \u2014 I can do a quick walk-through at your convenience and have a written cash offer to you within 24 hours. What day works best for you this week?\"\n\n\u2705 IF HESITANT:\n\"Absolutely no pressure at all. Let me leave you my number \u2014 it\u2019s "+myP+". If anything changes or you just want to explore your options, I\u2019m always just a phone call away.\"\n\n\ud83d\udcdd FOLLOW-UP QUESTIONS:\n1. Have you spoken with any other investors or agents about the property?\n2. Is there a specific timeline or deadline you\u2019re working around?\n3. If I could make the process completely hassle-free, what would that look like for you?\n4. What\u2019s the one thing that would make this easiest for you?"+nm+contact,fu:"\ud83d\udcdd KEY FOLLOW-UP QUESTIONS:\n\n1. Have you talked with any other investors or agents?\n2. Is there a timeline or deadline driving this?\n3. What would an ideal outcome look like for you?\n4. Is anyone else involved in the decision (spouse, attorney, etc.)?\n5. If the numbers worked, how quickly could you move forward?"}}
return{sc:"\ud83d\udcde WHOLESALE ACQUISITION SCRIPT\n\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500"+ad+propInfo+"\n\n\ud83c\udfac OPENING:\n\"Hi, may I speak with "+fn+"? Great \u2014 "+fn+", my name is "+myN+" with "+myC+". I\u2019m a local real estate investor right here in "+loc+". I hope I\u2019m not catching you at a bad time.\"\n\n\ud83d\udde3\ufe0f PITCH:\n\"The reason I\u2019m calling is I buy houses directly from homeowners \u2014 no real estate agents involved, no repairs needed on your end, and I pay with cash. I can typically close in 2 to 3 weeks.\n\nI\u2019m actively buying in "+l.area+" right now and I wanted to reach out to see if you\u2019d be open to a quick conversation about your property. Zero obligation.\"\n\n\ud83d\udcac QUALIFYING QUESTIONS:\n1. \"Is there currently a mortgage on the property? Roughly how much is left?\"\n2. \"How soon are you looking to make a move?\"\n3. \"Have you considered what price range you\u2019d need to make this work?\"\n4. \"Would you be open to a cash offer below retail in exchange for a fast, hassle-free close?\"\n\n\u2705 IF MOTIVATED:\n\"That\u2019s great to hear. Here\u2019s what I\u2019d like to do \u2014 I can come take a quick look at the property, and I\u2019ll have a written cash offer to you within 24 hours. No obligation. What day works for you?\"\n\n\u2705 IF ON THE FENCE:\n\"No problem at all \u2014 I completely understand. Let me send you a quick overview of exactly how the process works. It\u2019s very simple. My number is "+myP+" \u2014 feel free to reach out anytime.\"\n\n\u274c IF NOT INTERESTED:\n\"I totally respect that. If anything changes down the road, please don\u2019t hesitate to call me. My number is "+myP+". Thanks for your time, "+fn+".\""+nm+contact,fu:"\ud83d\udcdd KEY FOLLOW-UP QUESTIONS:\n\n1. What\u2019s the current mortgage balance?\n2. How quickly could you make a decision if the numbers worked?\n3. What would need to happen for you to move forward?\n4. Is there anyone else involved in the decision?\n5. What\u2019s your biggest concern about selling?"};}

function bDrip(l,loc){const fn=l.name.split(" ")[0],d=l.distressed;
return[{day:"Day 1",cls:"dd1",type:"\ud83d\udcde Call",label:"Initial",msg:d?"\"Hi "+fn+", I'm [Your Name] \u2014 investor in "+loc+". I help with difficult properties. Quick chat?\"":"\"Hi "+fn+", [Your Name] \u2014 investor in "+loc+". Buying in "+l.area+". 5 minutes?\""},{day:"Day 3",cls:"dd3",type:"\ud83d\udcf1 Text",label:"Follow-Up",msg:"Hi "+fn+", [Your Name] here \u2014 "+(d?"can make a fair cash offer":"still interested in cash offer")+". No pressure."},{day:"Day 5",cls:"dd5",type:"\u2709\ufe0f Email",label:"Email",msg:"Subject: "+l.area+" Property\n\nHi "+fn+",\n\nFollowing up. Cash, as-is, no commissions.\n\nQuick call?\n\n[Your Name] | [Phone]"},{day:"Day 7",cls:"dd7",type:"\ud83d\udcde Call",label:"VM",msg:"\"Hi "+fn+", [Your Name] \u2014 cash offers in "+l.area+" this week. [Phone].\""},{day:"Day 10",cls:"dd10",type:"\ud83d\udcf1 Text",label:"Final",msg:"Hi "+fn+", last note \u2014 quick cash sale in "+l.area+", I'm here. \u2014 [Your Name]"}];}

const SLIB=[{cat:"\ud83d\udcde Cold Calls",sub:"Proven openers",o:true,items:[{n:"Standard Seller",t:"call",b:"\"Hi, I'm [Your Name], investor in [City]. I buy directly \u2014 no agents, cash close 2\u20133 weeks. Open to a quick chat?\"\n\nASK:\n\u2022 Mortgage balance?\n\u2022 Timeline?\n\u2022 Open to cash below retail?"},{n:"Pre-Foreclosure",t:"call",b:"\"Hi [Name], I help homeowners avoid foreclosure. Close in 10 days, pay what you owe. Confidential.\""},{n:"Inherited",t:"call",b:"\"Hi [Name], I work with estate situations \u2014 cash, as-is, fast close, zero commissions.\""}]},{cat:"\ud83d\udcf1 SMS",sub:"Short & effective",items:[{n:"First Touch",t:"text",b:"Hi [Name], [Your Name] \u2014 investor in [City]. Buy as-is, cash, fast close. Quick chat? No pressure."},{n:"Follow-Up",t:"text",b:"Hey [Name], still interested. Cash offer, 2-week close, no repairs. Reply anytime!"}]},{cat:"\u2709\ufe0f Email",sub:"Email-first",items:[{n:"Outreach",t:"email",b:"Subject: Cash Offer\n\nHi [Name],\n\n\u2022 All-cash, 2\u20133 weeks\n\u2022 As-is, no repairs\n\u2022 No commissions\n\n10-min call?\n\n[Your Name] | [Phone]"}]},{cat:"\ud83d\udcfc Voicemail",sub:"No answer",items:[{n:"Standard",t:"vm",b:"\"Hi [Name], [Your Name] \u2014 investor. Buying in [Area]. Cash offer, no agents. [Phone].\""}]},{cat:"\ud83d\uded1 Objections",sub:"Handle pushbacks",isObj:true,items:[{q:"I have an agent.",a:"That's fine \u2014 I'm a backup cash offer if it doesn't sell quickly."},{q:"Too low.",a:"Trade-off is speed & certainty. Worth 5 min to compare the math?"},{q:"Need to think.",a:"Of course. Price, timeline, or info? I'll send a summary."},{q:"Are you legit?",a:"Proof of funds, title company refs, transparent contract."}]}];

// DEAL SHEET GENERATOR per blueprint
function genDealSheet(l,loc){
const d=l.deal;
return "========================================\n        WHOLESALE DEAL SHEET\n========================================\n\nProperty: "+l.propertyAddress+"\nOwner: "+l.name+"\nType: "+(l.propData?.propType||"SFR")+" | "+(l.propData?.bedBath||"3/2")+"\nSqFt: "+(l.propData?.sqft||"N/A")+" | Year: "+(l.propData?.yearBuilt||"N/A")+"\nLot: "+(l.propData?.lotSize||"N/A")+"\n\n--- DEAL NUMBERS ---\nARV: "+fmt(l.arv)+"\nRepair Estimate: "+fmt(l.repairCost)+"\nMAO (70% Rule): "+fmt(d?.mao)+"\nOffer to Seller: "+fmt(d?.offer)+"\nAssignment Fee: "+fmt(d?.fee)+"\nBuyer Equity: "+fmt(d?.equity)+"\n\n--- PROPERTY INTEL ---\nAssessed Value: "+fmt(l.propData?.assessed)+"\nEst. Mortgage: "+fmt(l.propData?.mortgageEst)+"\nEst. Equity: "+fmt(l.propData?.equityEst)+"\n\n--- SELLER INFO ---\nPhone: "+l.phone+(l.altPhone?" | Alt: "+l.altPhone:"")+"\nEmail: "+l.email+"\nMotivation: "+(l.motivTags?.length>0?l.motivTags.join(", "):"Standard")+"\nTimeline: "+l.timeline+"\nNotes: "+(l.userNotes||l.notes)+"\n\nLead Source: "+(l.leadSource||"N/A")+"\nGenerated by LeadForge PRO\n========================================";
}


// ====== REAL COMP ANALYSIS via RentCast API ======
// genComps returns a placeholder; real comps loaded asynchronously via fetchRealComps()
function genComps(l){return{comps:[],arvEst:l.arv||0,confidence:0,spread:0,loading:true}}

// ====== DEAL MARKETING PAGE HTML GENERATOR ======
function genMarketingPage(l,loc){ var d=l.deal||{};var pd=l.propData||{}; return '<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>Wholesale Deal - '+l.propertyStreet+'</title><style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:system-ui,sans-serif;background:#f5f0e8;color:#0d0d0d}.hero{background:linear-gradient(135deg,#0d0d0d,#1a2a3a);padding:2.5rem 1.5rem;color:#f5f0e8;text-align:center}.hero h1{font-size:1.8rem;margin-bottom:.3rem}.hero .price{font-size:2.5rem;font-weight:900;color:#c9a84c;margin:.5rem 0}.hero .sub{font-size:.9rem;opacity:.7}.container{max-width:700px;margin:0 auto;padding:1.5rem}.card{background:#fff;border:1px solid #d4c9b0;border-radius:8px;padding:1.5rem;margin-bottom:1rem;box-shadow:0 2px 14px rgba(0,0,0,.05)}.grid{display:grid;grid-template-columns:1fr 1fr;gap:.8rem;margin:.8rem 0}.stat{text-align:center;padding:.8rem;background:#faf7f0;border-radius:6px}.stat-n{font-size:1.5rem;font-weight:900;color:#c9a84c}.stat-l{font-size:.7rem;color:#8a7f6e;text-transform:uppercase;letter-spacing:.1em;margin-top:.2rem}.cta{display:block;width:100%;padding:1rem;background:#3a8a2e;color:#fff;border:none;border-radius:6px;font-size:1.1rem;font-weight:700;cursor:pointer;text-align:center;margin-top:1rem;text-decoration:none}.label{font-size:.65rem;color:#8a7f6e;text-transform:uppercase;letter-spacing:.15em;margin-bottom:.3rem}.val{font-size:.95rem;font-weight:600;margin-bottom:.6rem} /* SALES COACH */ .coach-cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:.9rem;margin-bottom:1.2rem} .coach-card{background:#fff;border:1.5px solid var(--bdr);border-radius:var(--r);overflow:hidden;cursor:pointer;transition:all .2s}.coach-card:hover{transform:translateY(-3px);box-shadow:0 8px 24px rgba(0,0,0,.1);border-color:var(--gold)} .coach-card-h{padding:.8rem 1rem;color:#f5f0e8;display:flex;align-items:center;gap:.6rem} .coach-card-h.call{background:linear-gradient(135deg,#1a3a6a,#2a5a9a)}.coach-card-h.text{background:linear-gradient(135deg,#2a6a20,#4a9a3e)}.coach-card-h.email{background:linear-gradient(135deg,#6a3a1a,#9a5a2a)}.coach-card-h.objection{background:linear-gradient(135deg,#5a1a3a,#8a2a5a)} .coach-card-ico{font-size:1.6rem}.coach-card-t{font-family:var(--sf);font-size:1rem;font-weight:700} .coach-card-bd{padding:.8rem 1rem}.coach-card-desc{font-size:.78rem;color:var(--mut);line-height:1.55;margin-bottom:.5rem} .coach-diff{font-family:var(--sm);font-size:.44rem;letter-spacing:.08em;text-transform:uppercase;padding:.15rem .4rem;border-radius:3px;display:inline-block} .coach-diff.easy{background:#e8f5e4;color:#2a6a20;border:1px solid #a8d4a0}.coach-diff.med{background:#fff3e0;color:#8a5a00;border:1px solid #e8c880}.coach-diff.hard{background:#fde8e8;color:#8a1a1a;border:1px solid #e8a0a0} .coach-chat{display:flex;flex-direction:column;gap:.5rem;min-height:200px;max-height:400px;overflow-y:auto;padding:.5rem;margin-bottom:.5rem;border:1px solid var(--bdr);border-radius:var(--r);background:var(--inp)} .coach-msg{padding:.55rem .75rem;border-radius:8px;font-size:.82rem;line-height:1.6;max-width:85%} .coach-msg.user{background:#dde8f8;border:1px solid #a0b8e0;align-self:flex-end;color:#1a2a4a} .coach-msg.seller{background:#fff;border:1px solid var(--bdr);align-self:flex-start;color:var(--fg)} .coach-msg.system{background:#f5f0ff;border:1px solid #c8b8e8;align-self:center;text-align:center;color:#4a2a6a;font-size:.76rem;max-width:95%} .coach-sender{font-family:var(--sm);font-size:.42rem;letter-spacing:.08em;text-transform:uppercase;margin-bottom:.2rem} .coach-sender.u{color:#1a3a6a}.coach-sender.s{color:var(--rust)} .coach-score-card{background:linear-gradient(135deg,var(--fg),#1a2a3a);border-radius:var(--r);padding:1.3rem;color:#f5f0e8;margin-top:.8rem} .coach-score-n{font-family:var(--sf);font-size:2.5rem;font-weight:900;color:var(--gold);text-align:center;margin-bottom:.3rem} .coach-score-l{font-family:var(--sm);font-size:.5rem;letter-spacing:.16em;text-transform:uppercase;text-align:center;color:var(--gold);margin-bottom:.8rem} .coach-fb{background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);border-radius:4px;padding:.7rem .85rem;margin-bottom:.5rem;font-size:.8rem;line-height:1.6} .coach-fb:last-child{margin-bottom:0} .coach-fb-t{font-family:var(--sm);font-size:.44rem;letter-spacing:.1em;text-transform:uppercase;margin-bottom:.3rem} .coach-fb-t.good{color:#80e0a0}.coach-fb-t.improve{color:#e8a060}.coach-fb-t.tip{color:#a0c0f0} </style></head><body><div class="hero"><h1>Investment Opportunity</h1><div class="sub">'+l.propertyAddress+'</div><div class="price">'+fmt(d.offer||0)+' Assignment</div><div class="sub">ARV: '+fmt(l.arv)+' | Fee: '+fmt(d.fee)+'</div></div><div class="container"><div class="card"><h2 style="margin-bottom:.8rem">Deal Numbers</h2><div class="grid"><div class="stat"><div class="stat-n">'+fmt(l.arv)+'</div><div class="stat-l">After Repair Value</div></div><div class="stat"><div class="stat-n">'+fmt(d.offer)+'</div><div class="stat-l">Offer / Assignment</div></div><div class="stat"><div class="stat-n">'+fmt(l.repairCost)+'</div><div class="stat-l">Est. Repairs</div></div><div class="stat"><div class="stat-n">'+fmt(d.equity)+'</div><div class="stat-l">Buyer Equity</div></div></div></div><div class="card"><h2 style="margin-bottom:.8rem">Property Details</h2><div class="label">Type</div><div class="val">'+(pd.propType||"SFR")+' | '+(pd.bedBath||"3/2")+'</div><div class="label">Size</div><div class="val">'+(pd.sqft?pd.sqft.toLocaleString():"N/A")+' sqft | Built '+(pd.yearBuilt||"N/A")+'</div><div class="label">Lot</div><div class="val">'+(pd.lotSize||"N/A")+'</div><div class="label">Assessed Value</div><div class="val">'+fmt(pd.assessed)+'</div><div class="label">Est. Equity</div><div class="val">'+fmt(pd.equityEst)+'</div></div><div class="card"><h2 style="margin-bottom:.8rem">Seller Timeline</h2><div class="val">'+l.timeline+'</div><div class="label">Notes</div><div class="val" style="font-weight:400">'+(l.userNotes||l.notes)+'</div></div><a href="mailto:?subject=Offer on '+encodeURIComponent(l.propertyStreet)+'&body=I am interested in this deal. Please send me the details." class="cta">Submit Offer / Contact Wholesaler</a><p style="text-align:center;margin-top:1rem;font-size:.75rem;color:#8a7f6e">Generated by LeadForge PRO | '+loc+'</p></div></body></html>'}

// ====== AUTO CONTRACT FROM DEAL ANALYZER ======
function genAutoContract(l,wName,fee,loc){
var d=l.deal||{};
var closeDate=new Date(Date.now()+21*86400000).toLocaleDateString();
var today2=new Date().toLocaleDateString("en-US",{month:"long",day:"numeric",year:"numeric"});
return "REAL ESTATE WHOLESALE ASSIGNMENT CONTRACT\n\nDate: "+today2+"\n\n"+
"PARTIES\nAssignor (Wholesaler): "+(wName||"[Your Name / Company]")+"\nSeller: "+l.name+"\nProperty: "+l.propertyAddress+"\n\n"+
"PURCHASE TERMS\nPurchase Price (to Seller): "+fmt(d.offer)+"\nAssignment Fee: "+fmt(fee?parseFloat(fee):d.fee)+"\nTotal Buyer Price: "+fmt((d.offer||0)+(fee?parseFloat(fee):d.fee||0))+"\nEarnest Money: $1,000 (non-refundable after inspection)\nInspection Period: 7 business days\nClosing Date: "+closeDate+"\n\n"+
"PROPERTY DETAILS\nType: "+(l.propData?.propType||"SFR")+" | "+(l.propData?.bedBath||"N/A")+"\n"+
"SqFt: "+(l.propData?.sqft||"N/A")+" | Year: "+(l.propData?.yearBuilt||"N/A")+"\n"+
"Assessed: "+fmt(l.propData?.assessed)+"\n"+
"ARV: "+fmt(l.arv)+" | Repairs: "+fmt(l.repairCost)+"\nMAO: "+fmt(d.mao)+"\n\n"+
"TERMS & CONDITIONS\n1. Property sold strictly AS-IS, WHERE-IS.\n2. Assignor assigns all rights and obligations to Assignee (end buyer).\n3. Assignment fee due at closing via wire or certified funds.\n4. Time is of the essence.\n5. Buyer has completed or waived independent due diligence.\n6. Subject to clear and marketable title.\n7. Closing costs split per local custom.\n8. Seller warrants authority to sell property.\n\n"+
"SELLER CONTACT\nName: "+l.name+"\nPhone: "+l.phone+(l.altPhone?" | Alt: "+l.altPhone:"")+"\nEmail: "+l.email+"\n\n"+
"SIGNATURES\n\nAssignor: "+(wName||"_______________")+"\nSign: _______________________  Date: ________\n\n"+
"Assignee (End Buyer): _______________\nSign: _______________________  Date: ________\n\n"+
"Seller: "+l.name+"\nSign: _______________________  Date: ________\n\n"+
"---\nFOR EDUCATIONAL USE ONLY. Consult a real estate attorney.\nGenerated by LeadForge PRO"}

// ====== LEAD CARD COMPONENT ======
const LCard=memo(function LCard({l,st,onSc,onDr,onDe,onCp,onCl,onNt,onDS,onAdd,isAdded,onSt,stRes,onStClr,onStSv,skipTraceId}){
const isD=l.distressed,sc=aScore(l,st),hot=sc>=80,hl=heatLabel(sc),[en,setEn]=useState(false),[nv,setNv]=useState(l.userNotes||""),deal=l.deal;
return(
React.createElement("div",{className:"lc"+(isD?" di":"")+(hot?" ht":"")+" au"},
React.createElement("div",{className:"lc-h"},
React.createElement("div",null,
React.createElement("div",{className:"lc-n"},hot&&React.createElement("span",{style:{marginRight:".25rem"}},"\ud83d\udd25"),l.name),
React.createElement("div",{className:"lc-tp"},l.type,l.lastContacted&&React.createElement("span",{style:{opacity:.65,marginLeft:".4rem"}},"\u00b7 ",l.lastContacted))
),
React.createElement("div",{style:{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:".15rem"}},
React.createElement("div",{className:"lc-sc",title:"Priority: "+sc},sc),
React.createElement("span",{className:"mtag "+heatCls(sc)},hl)
)
),
React.createElement("div",{className:"lc-bd"},
// Lead source tag
l.leadSource&&React.createElement("div",{style:{marginBottom:".4rem"}},
React.createElement("span",{className:"src-tag src-"+(l.leadSource==="Cold Call"?"call":l.leadSource==="SMS Campaign"?"sms":(l.leadSource||"").includes("D4D")?"d4d":l.leadSource==="Direct Mail"?"mail":(l.leadSource||"").includes("Web")?"web":l.leadSource==="Referral"?"ref":"skip")},"\ud83d\udce5 ",l.leadSource)
),
// Motivation tags
(l.motivTags||[]).length>0&&React.createElement("div",{style:{marginBottom:".4rem"}},(l.motivTags||[]).map(function(t){var mt=MOTIV_TAGS.find(function(x){return x.k===t});return React.createElement("span",{key:t,className:"mtag mtag-"+(mt?mt.c:"fc")},mt?mt.l:t)})),
// Address
l.propertyAddress&&React.createElement("div",{className:"abox"},
React.createElement("div",{className:"abox-t"},"\ud83d\udccd Property"),
React.createElement("div",{className:"abox-l"},l.propertyStreet),
React.createElement("div",{style:{fontWeight:400,fontSize:".74rem",color:"#3a3a6a"}},l.propertyCity,", ",l.propertyState," ",l.propertyZip),
React.createElement("div",{style:{marginTop:".3rem",display:"flex",gap:".4rem"}},
React.createElement("a",{href:"https://maps.google.com/?q="+encodeURIComponent(l.propertyAddress),target:"_blank",rel:"noreferrer",style:{fontFamily:"var(--sm)",fontSize:".42rem",letterSpacing:".1em",color:"#3a4a8a",textTransform:"uppercase",textDecoration:"none",border:"1px solid #c0cce8",borderRadius:3,padding:".1rem .3rem",background:"#e8eeff"}},"\ud83d\uddfa Maps"),
React.createElement("a",{href:"https://www.zillow.com/homes/"+encodeURIComponent(l.propertyAddress),target:"_blank",rel:"noreferrer",style:{fontFamily:"var(--sm)",fontSize:".42rem",letterSpacing:".1em",color:"#0d5e94",textTransform:"uppercase",textDecoration:"none",border:"1px solid #b0d0e8",borderRadius:3,padding:".1rem .3rem",background:"#e8f4ff"}},"\ud83c\udfe0 Zillow")
)
),
// Property intel box
l.propData&&React.createElement("div",{className:"pbox"},
React.createElement("div",{className:"pbox-t"},"\ud83d\udcca Property Intel"),
React.createElement("div",{style:{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:".2rem .5rem",fontSize:".72rem"}},
React.createElement("div",null,React.createElement("span",{style:{color:"var(--mut)",fontFamily:"var(--sm)",fontSize:".4rem",textTransform:"uppercase",display:"block"}},"Type"),l.propData.propType),
React.createElement("div",null,React.createElement("span",{style:{color:"var(--mut)",fontFamily:"var(--sm)",fontSize:".4rem",textTransform:"uppercase",display:"block"}},"Bed/Bath"),l.propData.bedBath),
React.createElement("div",null,React.createElement("span",{style:{color:"var(--mut)",fontFamily:"var(--sm)",fontSize:".4rem",textTransform:"uppercase",display:"block"}},"SqFt"),(l.propData.sqft||0).toLocaleString()),
React.createElement("div",null,React.createElement("span",{style:{color:"var(--mut)",fontFamily:"var(--sm)",fontSize:".4rem",textTransform:"uppercase",display:"block"}},"Year"),l.propData.yearBuilt),
React.createElement("div",null,React.createElement("span",{style:{color:"var(--mut)",fontFamily:"var(--sm)",fontSize:".4rem",textTransform:"uppercase",display:"block"}},"Assessed"),fmt(l.propData.assessed)),
React.createElement("div",null,React.createElement("span",{style:{color:"var(--mut)",fontFamily:"var(--sm)",fontSize:".4rem",textTransform:"uppercase",display:"block"}},"Est. Equity"),fmt(l.propData.equityEst))
)
),
// Contact box
React.createElement("div",{className:"cbox"},
React.createElement("div",{className:"cbox-t"},"\ud83d\udcde Contact"),
React.createElement("div",{className:"crow"},React.createElement("span",{className:"crow-i"},"\ud83d\udcf1"),React.createElement("span",{className:"crow-v"},l.phone?React.createElement(React.Fragment,null,React.createElement("a",{href:"tel:"+l.phone,onClick:onCl},l.phone),l.altPhone&&React.createElement("span",{style:{color:"var(--mut)"}}," \u00b7 ",React.createElement("a",{href:"tel:"+l.altPhone},l.altPhone))):React.createElement("span",{style:{color:"var(--mut)",fontSize:".78rem"}},"Skip trace needed \u2014 property records don\u2019t include phone"))),
React.createElement("div",{className:"crow"},React.createElement("span",{className:"crow-i"},"\u2709\ufe0f"),React.createElement("span",{className:"crow-v"},l.email?React.createElement("a",{href:"mailto:"+l.email},l.email):React.createElement("span",{style:{color:"var(--mut)",fontSize:".78rem"}},"Skip trace needed \u2014 property records don\u2019t include phone"))),
React.createElement("div",{className:"crow"},React.createElement("span",{className:"crow-i"},"\ud83d\udcac"),React.createElement("span",{className:"crow-v",style:{color:"#5a7a50",fontSize:".71rem"}},"Prefers: ",l.contactPref,l.contactCount>0&&" \u00b7 "+l.contactCount+"x"))
),
// Info rows
!isD&&[["\ud83d\udcb0","Budget",l.budget],["\u23f1","Timeline",l.timeline],["\ud83c\udfe1","Property",l.property]].map(function(r){return React.createElement("div",{className:"ri",key:r[1]},React.createElement("div",{className:"ri-i"},r[0]),React.createElement("div",null,React.createElement("div",{className:"ri-l"},r[1]),React.createElement("div",{className:"ri-v"},r[2])))}),
isD&&React.createElement("div",{className:"ri"},React.createElement("div",{className:"ri-i"},"\u23f1"),React.createElement("div",null,React.createElement("div",{className:"ri-l"},"Timeline"),React.createElement("div",{className:"ri-v"},l.timeline))),
isD&&l.taxOwed&&React.createElement("div",{className:"ri"},React.createElement("div",{className:"ri-i"},"\ud83e\uddfe"),React.createElement("div",null,React.createElement("div",{className:"ri-l"},"Taxes"),React.createElement("div",{className:"ri-v",style:{color:"#8b3a0f",fontWeight:600}},l.taxOwed," \u00b7 ",l.taxYears," \u00b7 Lien: ",l.taxLien))),
// Tags
React.createElement("div",{style:{marginTop:".4rem"}},isD?(l.distressTypes||[]).map(function(t){return React.createElement("span",{className:"dbadge",key:t},"\u26a0 ",t)}):(l.tags||[]).map(function(t){return React.createElement("span",{className:"tag",key:t},t)})),
// Violations
isD&&l.violations&&l.violations.length>0&&React.createElement("div",{className:"vbox"},React.createElement("div",{className:"vbox-l"},"Violations"),l.violations.map(function(v,i){return React.createElement("div",{className:"vbox-i",key:i},React.createElement("span",{style:{color:"var(--rust)"}},"\u203a"),React.createElement("span",null,v))})),
// Notes
React.createElement("div",{style:{marginTop:".45rem"}},!en?React.createElement("div",{className:"notes",onClick:function(){setEn(true)}},nv||l.notes,React.createElement("span",{style:{marginLeft:".3rem",fontSize:".6rem",color:"var(--gold)",opacity:.5}},"\u270e")):React.createElement("textarea",{className:"nedit",value:nv,autoFocus:true,rows:2,onChange:function(e){setNv(e.target.value)},onBlur:function(){setEn(false);onNt&&onNt(l.id,nv)}})),
// Deal numbers
deal&&deal.mao>0&&React.createElement("div",{className:"dbox"+(isD?" dd":"")},
React.createElement("div",{className:"dbox-t"},"\ud83d\udcbc Deal Numbers"),
React.createElement("div",{className:"dgrid"},[["ARV",fmt(l.arv),""],["Repairs",fmt(l.repairCost),"lo"],["MAO",fmt(deal.mao),""],["Offer",fmt(deal.offer),""],["Fee",fmt(deal.fee),"hi"],["Equity",fmt(deal.equity),""]].map(function(r){return React.createElement("div",{className:"dr",key:r[0]},React.createElement("div",{className:"dr-l"},r[0]),React.createElement("div",{className:"dr-v"+(r[2]?" "+r[2]:"")},r[1]))}))
),
// Stage
React.createElement("div",{style:{marginTop:".5rem"}},React.createElement("span",{className:"sb "+(SC[STAGES.indexOf(st)]||"s0")},st))
),
// Footer buttons
React.createElement("div",{className:"lc-ft"},
React.createElement(l.phone?"a":"button",l.phone?{href:"tel:"+l.phone,className:"lcb cl",onClick:function(e){onCl();cpy(l.phone);e.preventDefault();window.open("tel:"+l.phone)}}:{type:"button",className:"lcb cl",title:"No phone — skip trace to get contact info",style:{opacity:.5,cursor:"pointer"},onClick:function(){toast("No phone on record. Use the 🔍 Skip Trace button to find owner contact info free.");}},"\ud83d\udcde"),
React.createElement(l.phone?"a":"button",l.phone?{href:"sms:"+l.phone,className:"lcb go",style:{textDecoration:"none"},onClick:function(e){cpy(l.phone);e.preventDefault();window.open("sms:"+l.phone)}}:{type:"button",className:"lcb go",title:"No phone — skip trace needed",style:{opacity:.5,cursor:"pointer"},onClick:function(){toast("No phone on record. Use the 🔍 Skip Trace button to find owner contact info free.");}},"\ud83d\udcac"),
!l.phone&&React.createElement("button",{className:"lcb",style:{background:"var(--gold)",color:"#000",fontWeight:700},disabled:skipTraceId===l.id,onClick:function(){onSt(l)}},skipTraceId===l.id?"\u23f3 Tracing...":"\ud83d\udd0d Skip Trace"),
React.createElement("button",{className:"lcb",onClick:onSc},"Script"),
React.createElement("button",{className:"lcb",onClick:onDr},"Drip"),
React.createElement("button",{className:"lcb",onClick:onDe},"\ud83e\uddee"),
React.createElement("button",{className:"lcb",onClick:onDS},"\ud83d\udcc4"),
onAdd&&React.createElement("button",{className:"lcb hot",onClick:onAdd,disabled:isAdded,style:isAdded?{opacity:.55,cursor:"default"}:null},isAdded?"Added":"Add"),
React.createElement("button",{className:"lcb hot",onClick:onCp},"Copy")
),
// Skip trace results panel
stRes&&stRes.phones&&stRes.phones.length>0&&React.createElement("div",{className:"st-panel"},
React.createElement("div",{className:"st-hd"},"\ud83d\udd0d Skip Trace Results"+(stRes.searchedBy==="address"?" (by address)":" for "+l.name),React.createElement("button",{className:"st-cls",onClick:function(){onStClr(l.id)}},"✕")),
stRes.ownerName&&React.createElement("div",{style:{fontSize:".74rem",color:"var(--gold)",fontWeight:600,marginBottom:".3rem"}},"\ud83d\udc64 Owner: "+stRes.ownerName),
stRes.phones.map(function(ph,i){return React.createElement("div",{key:i,className:"st-row"},
React.createElement("span",{className:"st-ph"},ph),
React.createElement("button",{className:"lcb hot",style:{padding:"2px 8px",fontSize:".7rem"},onClick:function(){onStSv(l.id,ph,stRes.emails&&stRes.emails[0]||"",stRes.ownerName||null)}},"Save")
)}),
stRes.emails&&stRes.emails.length>0&&stRes.emails.map(function(em,i){return React.createElement("div",{key:"e"+i,className:"st-row"},
React.createElement("span",{className:"st-ph",style:{color:"var(--gold)"}},em),
React.createElement("button",{className:"lcb hot",style:{padding:"2px 8px",fontSize:".7rem"},onClick:function(){onStSv(l.id,"",em,stRes.ownerName||null)}},"Save")
)}),
stRes.source&&React.createElement("div",{style:{fontSize:".65rem",color:"rgba(255,255,255,.4)",marginTop:".25rem"}},"via "+stRes.sources?.join(", "))
),
stRes&&!stRes.found&&stRes.message&&React.createElement("div",{className:"st-panel st-none"},
React.createElement("div",{className:"st-hd"},"\ud83d\udd0d Skip Trace — No Results",React.createElement("button",{className:"st-cls",onClick:function(){onStClr(l.id)}},"✕")),
React.createElement("div",{style:{fontSize:".72rem",color:"rgba(255,255,255,.6)",marginTop:".3rem"}},stRes.message),
stRes.tip&&React.createElement("div",{style:{fontSize:".68rem",color:"var(--gold)",marginTop:".2rem"}},stRes.tip)
)
)
);});

// Due to size constraints, the main App component follows the same pattern as before
// but with all new features integrated. Writing it compactly:

export default function LeadForgePro({ userId }){
const[tab,setTab]=useState(0),[city,setCity]=useState(""),[state,setSt]=useState(""),[zip,setZip]=useState(""),[county,setCounty]=useState(""),[lt,setLt]=useState("Sellers Only"),[price,setPrice]=useState("any price range"),[num,setNum]=useState("8"),[wO,setWO]=useState(true),[fp,setFp]=useState("$10,000"),[cf,setCf]=useState("");
const ft=fp==="Custom"?cf:fp;
const[dO,setDO2]=useState(false),[df,setDf]=useState({codeViolations:false,delinquentTaxes:false,neglected:false,preForeclosure:false,probate:false,absenteeOwner:false,highEquity:false,tiredLandlord:false}),[dc,setDc]=useState("4");
const anyD=Object.values(df).some(Boolean);
const[loading,setLd]=useState(false),[searchResults,setSearchResults]=useState([]),[searchMeta,setSearchMeta]=useState(null),[leads,setLeads]=useState([]),[loc,setLoc]=useState(""),[pipe,setPipe]=useState({}),[tracker,setTracker]=useState([]),[modal,setModal]=useState(null),[qa,setQa]=useState(false);
const[cxL,setCxL]=useState(null),[cxW,setCxW]=useState(""),[cxB,setCxB]=useState(""),[cxF,setCxF]=useState("");
const[daA,setDaA]=useState(""),[daR,setDaR]=useState(""),[daF2,setDaF]=useState(""),[daRes,setDaRes]=useState(null),[tasks,setTasks]=useState({});
const[qn,setQn]=useState({name:"",phone:"",email:"",street:"",type:"Seller",timeline:"30\u201360 days",arv:"",repairs:"",notes:"",source:"Cold Call"});
// Rehab estimator state
const[rehab,setRehab]=useState(REHAB_CATS.reduce(function(a,c){a[c.k]=c.def;return a},{}));
const rehabTotal=Object.values(rehab).reduce(function(a,v){return a+v},0);

// AI Negotiation state
const[aiChat,setAiChat]=useState([]);
const[aiInput,setAiInput]=useState("");
const[aiLoading,setAiLoading]=useState(false);
const[compData,setCompData]=useState(null);
// Scripts tab state (must be at component level for hooks rules)
const[scrOpen,setScrOpen]=useState({0:true});
const[userName,setUserName]=useState("");
const[userCompany,setUserCompany]=useState("");
const[userPhone2,setUserPhone2]=useState("");
const[scrSearch,setScrSearch]=useState("");
// Sales Coach state
const[coachMode,setCoachMode]=useState(null);
const[coachChat,setCoachChat]=useState([]);
const[coachInput,setCoachInput]=useState("");
const[coachLoading,setCoachLoading]=useState(false);
const[coachScore,setCoachScore]=useState(null);
const[coachExCount,setCoachExCount]=useState(0);
const[progressLoaded,setProgressLoaded]=useState(false);
const[dbBuyers,setDbBuyers]=useState([]);
const[buyersLoaded,setBuyersLoaded]=useState(false);
const[addBuyerOpen,setAddBuyerOpen]=useState(false);
const[newBuyer,setNewBuyer]=useState({name:"",company:"",buyer_type:"Fix & Flip",phone:"",email:"",price_min:"",price_max:"",criteria:"",locations:"",rehab_tolerance:"Medium",financing:"Cash",notes:""});
const supabase=useMemo(function(){return createClient()},[]);
// Markets + Automation state
const[markets,setMarkets]=useState([]);
const[autoSettings,setAutoSettings]=useState({auto_mode:false,frequency_hours:24,auto_buyers:true,auto_stage:true,auto_followup_days:3,auto_dead_days:21,last_auto_run:null});
const[autoRunning,setAutoRunning]=useState(false);
const[autoResult,setAutoResult]=useState(null);
const[autoSettingsOpen,setAutoSettingsOpen]=useState(false);
const[marketsOpen,setMarketsOpen]=useState(false);
const[addMarketOpen,setAddMarketOpen]=useState(false);
const[newMarket,setNewMarket]=useState({city:"",state:"",zip:"",county:"",price_range:"any price range",fee_target:"$10,000",lead_types:"Sellers Only",distress_filters:{}});
const[discoverOpen,setDiscoverOpen]=useState(false);
const[discoverCity,setDiscoverCity]=useState("");
const[discoverState,setDiscoverState]=useState("");
const[discoverRunning,setDiscoverRunning]=useState(false);
const[discoverResult,setDiscoverResult]=useState(null);
const[legalOpen,setLegalOpen]=useState(false);
const[legalStateDetail,setLegalStateDetail]=useState(null);
const[skipTraceId,setSkipTraceId]=useState(null);
const[skipTraceResults,setSkipTraceResults]=useState({});
const[enriching,setEnriching]=useState(false);
const[enrichCount,setEnrichCount]=useState(0);

// Wholesale legality warnings by state
// ── COMPREHENSIVE STATE LEGAL DATABASE ───────────────────────────
// Levels: "danger" = license likely required | "warn" = caution/disclosure | "ok" = generally permitted
// DISCLAIMER: This is general information only, NOT legal advice. Laws change frequently.
// Always consult a licensed real estate attorney in the relevant state before wholesaling.
const STATE_LEGAL={
  // 🔴 HIGH RISK — License Likely Required or Actively Enforced
  IL:{level:"danger",summary:"License Required",short:"IL requires a RE license for wholesale assignment (HB 1374, 2023).",detail:"Illinois HB 1374 (effective Jan 2024) significantly restricts wholesaling. Assigning a real estate purchase contract for profit without a real estate license may violate the Illinois Real Estate License Act. The Illinois REALTORS® have actively lobbied for enforcement. This is one of the most restrictive wholesale states in the country.",action:"Do NOT wholesale in Illinois without consulting a licensed Illinois real estate attorney. A real estate license may be required."},
  OK:{level:"danger",summary:"License Required",short:"Oklahoma's RE License Code likely requires a license for wholesale assignment.",detail:"The Oklahoma Real Estate Commission has taken the position that assigning purchase contracts for compensation constitutes real estate brokerage requiring a license. Enforcement actions have occurred. Oklahoma is considered a high-risk state for unlicensed wholesaling.",action:"Obtain an Oklahoma real estate license or work with a licensed agent. Consult an OK attorney before any wholesale activity."},
  SC:{level:"danger",summary:"License Likely Required",short:"SC RE Commission: Assignment-for-profit likely requires a license.",detail:"The South Carolina Real Estate Commission has issued guidance indicating that assigning contracts for profit likely constitutes real estate brokerage activity requiring licensure under SC Code § 40-57-30. Several enforcement actions have been taken against unlicensed wholesalers.",action:"Consult a South Carolina real estate attorney before proceeding. A license may be required for assignment-for-profit activities."},
  // 🟡 CAUTION — Disclosure Required, Regulated, or Pending Legislation
  GA:{level:"warn",summary:"Disclosure Required",short:"GA SB 44: Must disclose wholesaler status in all marketing & contracts.",detail:"Georgia SB 44 (signed 2022) requires anyone marketing or contracting to purchase real property for the purpose of assigning the contract for profit to clearly disclose their status as a 'real estate wholesaler' in all advertising, marketing, and in the purchase contract itself. Failure to disclose can result in contract voidability and civil penalties.",action:"Always include 'Seller acknowledges buyer is a real estate wholesaler' or equivalent language in all Georgia contracts and marketing materials."},
  TX:{level:"warn",summary:"TREC Forms Required",short:"TX requires TREC-approved contract forms and has regulated wholesale assignment.",detail:"Texas requires use of Texas Real Estate Commission (TREC) promulgated contract forms for most residential real estate transactions. Wholesale assignments must use proper TREC forms with appropriate addenda. The Texas Occupations Code regulates when real estate licenses are required. Simultaneous closings (double closes) are common and generally permitted.",action:"Use TREC-approved forms exclusively. Use an Assignment of Contract addendum. Consult a TX real estate attorney for compliance."},
  KY:{level:"warn",summary:"Legislation Pending",short:"KY has seen proposed bills targeting unlicensed wholesale activity.",detail:"Kentucky has seen proposed legislation (HB 406 and similar bills) that would require real estate licensure for wholesale activities. While not yet law at time of last update, the legislative trend indicates increased regulatory risk. Current Kentucky RE Commission guidance should be verified.",action:"Monitor current Kentucky legislation at ky.gov. Consult a KY real estate attorney for current requirements before proceeding."},
  MD:{level:"warn",summary:"Disclosure & Restrictions Apply",short:"MD has disclosure requirements and some localities add restrictions.",detail:"Maryland has real estate disclosure requirements that apply to wholesale transactions. Montgomery County and other jurisdictions have adopted additional restrictions. The Maryland RE Commission has reviewed wholesale practices. Double closings are generally used to mitigate risk.",action:"Use written disclosures in all contracts. Consult a Maryland real estate attorney, particularly for transactions in Montgomery County or Baltimore City."},
  NM:{level:"warn",summary:"Gray Area — Regulatory Attention",short:"NM RE Commission has questioned whether some wholesale practices require a license.",detail:"The New Mexico Real Estate Commission has reviewed whether assigning contracts for profit constitutes brokerage requiring licensure under NMSA 61-29. While no definitive ruling has been issued, the regulatory environment is uncertain. New Mexico is a smaller wholesale market with less legal precedent.",action:"Consult a New Mexico real estate attorney before any wholesale activity. Use double-close strategy to reduce risk."},
  VA:{level:"warn",summary:"Disclosure Required",short:"VA requires disclosure of wholesale/assignment intent in purchase contracts.",detail:"Virginia has professional licensing requirements that can apply to real estate activities. While assignment of equitable interest is generally permitted, Virginia RE Board guidance recommends clear disclosure of wholesale intent. Some Northern Virginia markets have seen increased scrutiny.",action:"Include clear disclosure of assignment intent in all purchase contracts. Consult a Virginia real estate attorney for Northern VA transactions."},
  NY:{level:"warn",summary:"Caution — License Gray Area",short:"NY's licensing laws create uncertainty for wholesale assignment-for-profit.",detail:"New York's Real Property Law and licensing statutes are broadly written and could be interpreted to require a license for some wholesale activities. The NY Department of State has jurisdiction over real estate licensee conduct. The 'finder's fee' model used in NYC is legally distinct from assignment of contracts.",action:"New York wholesale activity should be structured carefully. Consult a New York real estate attorney, especially for NYC and Long Island transactions."},
  NJ:{level:"warn",summary:"Caution Advised",short:"NJ RE Commission has reviewed wholesale practices; some county restrictions apply.",detail:"New Jersey's Real Estate Commission has examined wholesale real estate practices. Certain disclosure requirements apply. Some counties have adopted additional restrictions or transfer taxes that affect wholesale deals.",action:"Consult a New Jersey real estate attorney. Ensure all required disclosures are included in purchase contracts."},
  CA:{level:"warn",summary:"Complex — Disclosure & DRE Oversight",short:"CA has strict disclosure laws and the DRE monitors unlicensed brokerage activity.",detail:"California's Department of Real Estate (DRE) has broad jurisdiction and actively monitors real estate activities. While assigning equitable interest is generally permitted, California's disclosure requirements are extensive. The Unruh Civil Rights Act and other statutes add compliance layers. California transfer taxes can significantly affect deal economics.",action:"California wholesale requires careful legal structuring. Use entity-based ownership transfers or proper assignment disclosures. Consult a California real estate attorney."},
  // 🟢 GENERALLY PERMITTED — Active Wholesale Markets
  FL:{level:"ok",summary:"Generally Permitted",short:"FL is one of the most wholesaler-friendly states. No license required for contract assignment.",detail:"Florida is widely considered the most favorable state for wholesale real estate. Assigning equitable interest in a purchase contract is clearly permitted without a real estate license under Florida law. The Florida RE Commission has not taken action against properly structured wholesale assignments. Proper disclosure of assignment intent is recommended.",action:"Include assignment disclosure in contracts. Consider 'and/or assigns' language in buyer name. No license required."},
  AZ:{level:"ok",summary:"Generally Permitted",short:"AZ is highly wholesaler-friendly with no specific licensing for assignment.",detail:"Arizona is one of the top wholesale markets in the country (Phoenix metro). The Arizona Department of Real Estate permits assignment of purchase contracts without a real estate license. Double closes and simultaneous closings are common and well-accepted by title companies.",action:"Use standard Arizona purchase contract with assignment addendum. AZ title companies are experienced with wholesale transactions."},
  NV:{level:"ok",summary:"Generally Permitted",short:"NV permits wholesale assignment without a license. Las Vegas is a major market.",detail:"Nevada permits assignment of real estate purchase contracts without a real estate license. The Nevada RE Division has not taken action against properly structured wholesale assignments. Las Vegas and Henderson are among the most active wholesale markets nationally.",action:"Use standard NV purchase contract. Include assignment clause. Work with wholesale-friendly title companies in Las Vegas."},
  OH:{level:"ok",summary:"Generally Permitted",short:"OH is a major wholesale market with no specific licensing for assignment.",detail:"Ohio is one of the top 5 wholesale markets in the country. Cleveland, Columbus, Cincinnati, and Dayton all have very active wholesale activity. The Ohio Division of Real Estate permits contract assignment without a license.",action:"Use standard Ohio purchase contract with assignment language. Ohio title companies routinely handle wholesale closings."},
  IN:{level:"ok",summary:"Generally Permitted",short:"IN permits wholesale assignment; Indianapolis is a major market.",detail:"Indiana is very wholesaler-friendly. Indianapolis consistently ranks among the top wholesale markets in the nation. The Indiana Professional Licensing Agency does not require a license for contract assignment.",action:"Standard wholesale contracts are well-accepted by Indiana title companies. Indianapolis has several title companies specializing in wholesale closings."},
  TN:{level:"ok",summary:"Generally Permitted",short:"TN permits wholesale assignment; Nashville and Memphis are active markets.",detail:"Tennessee is an active wholesale market, particularly Nashville (hot market) and Memphis (high cash buyer activity). The Tennessee RE Commission permits contract assignment without a license.",action:"Use standard purchase contract with assignment clause. Memphis in particular has a large cash buyer network due to high investor activity."},
  NC:{level:"ok",summary:"Generally Permitted",short:"NC permits wholesale assignment; Charlotte and Raleigh are major markets.",detail:"North Carolina permits assignment of real estate purchase contracts. Charlotte and the Research Triangle (Raleigh/Durham) are growing wholesale markets. NC RE Commission has not taken enforcement actions against properly structured wholesale deals.",action:"Use standard NC purchase contract. Include assignment language. Some closing attorneys specialize in wholesale transactions in Charlotte."},
  MO:{level:"ok",summary:"Generally Permitted",short:"MO permits wholesale; Kansas City and St. Louis are established markets.",detail:"Missouri is wholesale-friendly. Kansas City is one of the most active wholesale markets in the Midwest. The Missouri RE Commission permits contract assignment without a license.",action:"Standard wholesale contracts are accepted. Kansas City has a well-established network of title companies handling wholesale closings."},
  MI:{level:"ok",summary:"Generally Permitted",short:"MI permits wholesale assignment; Detroit metro is a major market.",detail:"Michigan permits contract assignment without a license. Detroit, Grand Rapids, and Flint are active wholesale markets. Michigan's post-2008 housing market created a strong wholesale ecosystem that remains active.",action:"Standard wholesale contracts. Michigan title companies in Detroit metro routinely handle wholesale deals."},
  PA:{level:"ok",summary:"Generally Permitted",short:"PA permits wholesale; Philadelphia and Pittsburgh are active markets.",detail:"Pennsylvania permits assignment of purchase contracts. Philadelphia is one of the most active wholesale markets on the East Coast. Pittsburgh also has significant wholesale activity. Pennsylvania RE Commission permits contract assignment without a license.",action:"Standard wholesale purchase contracts. Philadelphia has many title companies experienced with wholesale closings."},
  CO:{level:"ok",summary:"Generally Permitted",short:"CO permits wholesale; Denver metro is a top national market.",detail:"Colorado permits contract assignment without a real estate license. Denver and the Front Range are among the most active wholesale markets in the country. Colorado RE Commission does not require a license for assignment of equitable interest.",action:"Use Colorado standard contract forms with assignment addendum. Denver title companies are very familiar with wholesale transactions."},
  TX:{level:"warn",summary:"TREC Forms Required",short:"TX requires TREC-approved contract forms. See caution above.",detail:"See caution details above.",action:"Use TREC-approved forms exclusively."},
  AL:{level:"ok",summary:"Generally Permitted",short:"Alabama permits wholesale contract assignment without a license.",detail:"Alabama is wholesaler-friendly. Birmingham and Huntsville are growing wholesale markets. The Alabama RE Commission permits contract assignment without a license.",action:"Standard wholesale contracts. Birmingham title companies handle wholesale closings."},
  AR:{level:"ok",summary:"Generally Permitted",short:"Arkansas permits wholesale assignment. Little Rock is the primary market.",detail:"Arkansas permits contract assignment without a license. Little Rock has a growing wholesale community. The Arkansas RE Commission does not specifically restrict contract assignment.",action:"Standard wholesale purchase contracts. Work with local RE attorneys for closings."},
  MS:{level:"ok",summary:"Generally Permitted",short:"Mississippi permits wholesale assignment. Jackson is the primary market.",detail:"Mississippi permits contract assignment without a license. Jackson and the Gulf Coast have wholesale activity. The Mississippi RE Commission does not specifically restrict assignment of contracts.",action:"Standard wholesale contracts. Work with local title companies or closing attorneys."},
  LA:{level:"ok",summary:"Generally Permitted",short:"Louisiana permits wholesale; New Orleans and Baton Rouge are active markets.",detail:"Louisiana (a civil law state) permits contract assignment. New Orleans and Baton Rouge are active wholesale markets. Louisiana uses 'acts of sale' rather than deeds, so closing procedures differ from common law states.",action:"Work with a Louisiana real estate attorney familiar with assignment of contracts. Louisiana closings require a notary/attorney."},
  WI:{level:"ok",summary:"Generally Permitted",short:"Wisconsin permits wholesale assignment; Milwaukee is the primary market.",detail:"Wisconsin permits contract assignment without a license. Milwaukee has significant wholesale activity. The Wisconsin RE Examining Board does not require a license for contract assignment.",action:"Standard wholesale contracts. Milwaukee title companies handle wholesale closings."},
  MN:{level:"ok",summary:"Generally Permitted",short:"Minnesota permits wholesale; Minneapolis-St. Paul is the primary market.",detail:"Minnesota permits contract assignment without a license. The Twin Cities metro has an active wholesale community. Minnesota RE Commission does not restrict properly structured wholesale assignments.",action:"Standard wholesale contracts. Minneapolis has title companies experienced with wholesale."},
  IA:{level:"ok",summary:"Generally Permitted",short:"Iowa permits wholesale assignment; Des Moines is the primary market.",detail:"Iowa permits contract assignment without a license. Des Moines has a growing wholesale market. The Iowa RE Commission does not specifically restrict contract assignment.",action:"Standard wholesale purchase contracts."},
  KS:{level:"ok",summary:"Generally Permitted",short:"Kansas permits wholesale; Kansas City (KS side) and Wichita are markets.",detail:"Kansas permits contract assignment without a license. The Kansas City metro (Kansas side) and Wichita have wholesale activity.",action:"Standard wholesale contracts."},
  NE:{level:"ok",summary:"Generally Permitted",short:"Nebraska permits wholesale; Omaha is the primary market.",detail:"Nebraska permits contract assignment without a license. Omaha has an active wholesale community. Nebraska RE Commission does not restrict properly structured wholesale assignments.",action:"Standard wholesale purchase contracts."},
  SD:{level:"ok",summary:"Generally Permitted",short:"South Dakota permits wholesale assignment.",detail:"South Dakota permits contract assignment without a license. Sioux Falls is the primary market. Very wholesale-friendly regulatory environment.",action:"Standard wholesale contracts."},
  ND:{level:"ok",summary:"Generally Permitted",short:"North Dakota permits wholesale assignment. Fargo is the primary market.",detail:"North Dakota permits contract assignment without a license. Fargo-Moorhead is the primary wholesale market. The state has a very small wholesale community.",action:"Standard wholesale contracts. Work with local RE attorneys for closings."},
  MT:{level:"ok",summary:"Generally Permitted",short:"Montana permits wholesale assignment; Billings and Missoula are markets.",detail:"Montana permits contract assignment without a license. Billings and Missoula have some wholesale activity. Montana is a smaller market with growing investor interest.",action:"Standard wholesale contracts. Montana closings typically done through title companies or attorneys."},
  WY:{level:"ok",summary:"Generally Permitted",short:"Wyoming permits wholesale assignment; Cheyenne and Casper are markets.",detail:"Wyoming permits contract assignment without a license. Wyoming has a very small wholesale community. The state's minimal regulation makes it legally straightforward.",action:"Standard wholesale purchase contracts."},
  ID:{level:"ok",summary:"Generally Permitted",short:"Idaho permits wholesale; Boise is a fast-growing market.",detail:"Idaho permits contract assignment without a license. Boise has emerged as one of the fastest-growing wholesale markets in the country due to rapid population growth.",action:"Standard wholesale contracts. Boise title companies handle wholesale closings."},
  OR:{level:"ok",summary:"Generally Permitted",short:"Oregon permits wholesale; Portland is the primary market.",detail:"Oregon permits contract assignment without a license. Portland has a wholesale community, though the hot seller's market has reduced deal flow. Oregon RE Agency does not restrict contract assignment.",action:"Standard wholesale purchase contracts. Work with Portland-area title companies."},
  WA:{level:"ok",summary:"Generally Permitted",short:"Washington permits wholesale; Seattle metro is the primary market.",detail:"Washington state permits contract assignment without a license. Seattle and Tacoma have active wholesale markets, though competitive markets mean thinner margins. Washington RE Commission does not restrict contract assignment.",action:"Standard wholesale contracts. Washington title companies are familiar with wholesale transactions."},
  UT:{level:"ok",summary:"Generally Permitted",short:"Utah permits wholesale; Salt Lake City is a growing market.",detail:"Utah permits contract assignment without a license. Salt Lake City and Provo have growing wholesale markets. Utah RE Division does not restrict properly structured wholesale assignments.",action:"Standard wholesale contracts. Salt Lake title companies handle wholesale closings."},
  HI:{level:"ok",summary:"Generally Permitted — Limited Market",short:"Hawaii permits wholesale but high prices limit deal flow.",detail:"Hawaii permits contract assignment without a license. The extremely high property values in Hawaii (especially Honolulu) make traditional wholesale difficult. Creative financing and niche distressed properties are the typical approach.",action:"Standard wholesale contracts. Work with a Hawaii real estate attorney given the unique market conditions."},
  AK:{level:"ok",summary:"Generally Permitted — Limited Market",short:"Alaska permits wholesale; Anchorage is the primary market.",detail:"Alaska permits contract assignment without a license. Anchorage has a small but active wholesale community. Alaska RE Commission does not restrict contract assignment.",action:"Standard wholesale contracts. Work with Anchorage-area title companies."},
  CT:{level:"ok",summary:"Generally Permitted",short:"Connecticut permits wholesale; Hartford and Bridgeport are markets.",detail:"Connecticut permits contract assignment without a license. Hartford and the state's distressed markets offer wholesale opportunities. CT RE Commission does not restrict contract assignment.",action:"Standard wholesale contracts. Work with Connecticut title companies or real estate attorneys (closings typically attorney-handled in CT)."},
  DE:{level:"ok",summary:"Generally Permitted",short:"Delaware permits wholesale; Wilmington is the primary market.",detail:"Delaware permits contract assignment without a license. Wilmington and surrounding areas have wholesale activity. Delaware's business-friendly environment extends to real estate investing.",action:"Standard wholesale contracts. Delaware closings handled by attorneys."},
  ME:{level:"ok",summary:"Generally Permitted",short:"Maine permits wholesale; Portland (ME) is the primary market.",detail:"Maine permits contract assignment without a license. Portland (Maine) and surrounding areas have growing wholesale activity as remote work drives demand.",action:"Standard wholesale contracts. Maine closings typically handled by attorneys."},
  NH:{level:"ok",summary:"Generally Permitted",short:"New Hampshire permits wholesale; Manchester and Nashua are markets.",detail:"New Hampshire permits contract assignment without a license. Southern NH (Manchester, Nashua, Concord) has wholesale activity driven by the Boston market spillover.",action:"Standard wholesale contracts. NH closings handled by title companies or attorneys."},
  VT:{level:"ok",summary:"Generally Permitted — Limited Market",short:"Vermont permits wholesale; Burlington is the primary market.",detail:"Vermont permits contract assignment without a license. The Vermont market is very limited due to low population and high property values relative to income. Very small wholesale community.",action:"Standard wholesale contracts. Vermont closings typically handled by attorneys."},
  RI:{level:"ok",summary:"Generally Permitted",short:"Rhode Island permits wholesale; Providence is the primary market.",detail:"Rhode Island permits contract assignment without a license. Providence has a small but active wholesale community. RI RE Commission does not restrict contract assignment.",action:"Standard wholesale contracts. Rhode Island closings typically handled by attorneys."},
  MA:{level:"ok",summary:"Generally Permitted — Disclosure Advised",short:"Massachusetts permits wholesale; Boston area and Springfield are markets.",detail:"Massachusetts permits contract assignment without a license. However, Massachusetts has strict consumer protection laws (Chapter 93A) that require good faith dealing. Clear disclosure of wholesale intent is strongly recommended. Western MA (Springfield, Worcester) has lower price points more amenable to wholesale.",action:"Include clear disclosure of assignment intent. Consult a MA real estate attorney. Boston-area title companies handle wholesale."},
  WV:{level:"ok",summary:"Generally Permitted",short:"West Virginia permits wholesale; Charleston and Huntington are markets.",detail:"West Virginia permits contract assignment without a license. Charleston and Huntington have distressed property wholesale opportunities. WV RE Commission does not restrict contract assignment.",action:"Standard wholesale contracts. WV closings handled by title companies or attorneys."},
};

// Map old WHOLESALE_WARNINGS reference to STATE_LEGAL for backward compat
const WHOLESALE_WARNINGS=STATE_LEGAL;

const US_STATES=[
  {c:"AL",n:"Alabama"},{c:"AK",n:"Alaska"},{c:"AZ",n:"Arizona"},{c:"AR",n:"Arkansas"},
  {c:"CA",n:"California"},{c:"CO",n:"Colorado"},{c:"CT",n:"Connecticut"},{c:"DE",n:"Delaware"},
  {c:"FL",n:"Florida"},{c:"GA",n:"Georgia"},{c:"HI",n:"Hawaii"},{c:"ID",n:"Idaho"},
  {c:"IL",n:"Illinois"},{c:"IN",n:"Indiana"},{c:"IA",n:"Iowa"},{c:"KS",n:"Kansas"},
  {c:"KY",n:"Kentucky"},{c:"LA",n:"Louisiana"},{c:"ME",n:"Maine"},{c:"MD",n:"Maryland"},
  {c:"MA",n:"Massachusetts"},{c:"MI",n:"Michigan"},{c:"MN",n:"Minnesota"},{c:"MS",n:"Mississippi"},
  {c:"MO",n:"Missouri"},{c:"MT",n:"Montana"},{c:"NE",n:"Nebraska"},{c:"NV",n:"Nevada"},
  {c:"NH",n:"New Hampshire"},{c:"NJ",n:"New Jersey"},{c:"NM",n:"New Mexico"},{c:"NY",n:"New York"},
  {c:"NC",n:"North Carolina"},{c:"ND",n:"North Dakota"},{c:"OH",n:"Ohio"},{c:"OK",n:"Oklahoma"},
  {c:"OR",n:"Oregon"},{c:"PA",n:"Pennsylvania"},{c:"RI",n:"Rhode Island"},{c:"SC",n:"South Carolina"},
  {c:"SD",n:"South Dakota"},{c:"TN",n:"Tennessee"},{c:"TX",n:"Texas"},{c:"UT",n:"Utah"},
  {c:"VT",n:"Vermont"},{c:"VA",n:"Virginia"},{c:"WA",n:"Washington"},{c:"WV",n:"West Virginia"},
  {c:"WI",n:"Wisconsin"},{c:"WY",n:"Wyoming"}
];

async function authedJson(endpoint,payload,method){
var sessionResult=await supabase.auth.getSession();
var session=sessionResult?.data?.session;
if(!session?.access_token)throw new Error("Please sign in again.");
var opts={method:method||"POST",headers:{"Content-Type":"application/json","Authorization":"Bearer "+session.access_token}};
if(payload!==undefined)opts.body=JSON.stringify(payload);
var resp=await fetch(endpoint,opts);
var data={};
try{data=await resp.json()}catch{}
if(!resp.ok)throw new Error(data?.error||"Request failed");
return data;
}

// Load buyers from database
useEffect(function(){
if(!userId)return;
(async function(){
try{
var data=await authedJson("/api/buyers",undefined,"GET");
if(Array.isArray(data?.buyers))setDbBuyers(data.buyers);
}catch(e){console.warn("buyers load:",e?.message)}finally{setBuyersLoaded(true)}
})();
},[userId]);

// Load markets + automation settings, then check if auto-run is due
useEffect(function(){
if(!userId)return;
(async function(){
try{
var [mData,aData]=await Promise.all([
authedJson("/api/markets",undefined,"GET"),
authedJson("/api/automation/settings",undefined,"GET")
]);
if(Array.isArray(mData?.markets))setMarkets(mData.markets);
if(aData?.settings)setAutoSettings(aData.settings);
// Check if auto-run is due
var s=aData?.settings;
if(s?.auto_mode&&s?.frequency_hours){
var lastRun=s.last_auto_run?new Date(s.last_auto_run):null;
var hoursSince=lastRun?(Date.now()-lastRun.getTime())/3600000:999;
if(hoursSince>=s.frequency_hours){
runAutoResearch(true);
}
}
}catch(e){console.warn("markets/auto load:",e?.message)}
})();
},[userId]);

async function saveAutoSettings(updates){
var merged=Object.assign({},autoSettings,updates);
setAutoSettings(merged);
try{await authedJson("/api/automation/settings",merged)}catch(e){toast("Settings save failed.")}
}

async function saveMarket(){
if(!newMarket.city||!newMarket.state){toast("City and state required.");return;}
try{
var payload=Object.assign({},newMarket,{lead_types:[newMarket.lead_types||"Sellers Only"]});
var data=await authedJson("/api/markets",payload);
if(data.market)setMarkets(function(prev){return[].concat(prev,[data.market])});
setAddMarketOpen(false);
setNewMarket({city:"",state:"FL",zip:"",county:"",price_range:"any price range",fee_target:"$10,000",lead_types:"Sellers Only",distress_filters:{}});
toast("Market added!");
}catch(e){toast("Failed: "+(e?.message||"error"))}
}

async function deleteMarket(id){
try{
await authedJson("/api/markets?id="+id,undefined,"DELETE");
setMarkets(function(prev){return prev.filter(function(m){return m.id!==id})});
toast("Market removed.");
}catch(e){toast("Delete failed.")}
}

async function runAutoResearch(silent){
if(autoRunning)return;
setAutoRunning(true);
if(!silent)toast("Auto-research running…");
try{
var data=await authedJson("/api/automation/run",{});
setAutoResult(data);
if(!silent)toast(data.message||("Done: "+data.newLeads+" new leads, "+data.newBuyers+" buyers"));
// Reload buyers and trigger leads reload signal
var bData=await authedJson("/api/buyers",undefined,"GET");
if(Array.isArray(bData?.buyers))setDbBuyers(bData.buyers);
}catch(e){
if(!silent)toast("Auto-research failed: "+(e?.message||"error"));
}finally{setAutoRunning(false)}
}

async function runDiscoverBuyers(){
if(!discoverCity||!discoverState){toast("Enter city and state first.");return;}
setDiscoverRunning(true);
setDiscoverResult(null);
try{
var data=await authedJson("/api/buyers/discover",{city:discoverCity,state:discoverState});
setDiscoverResult(data);
toast(data.message||("Found "+data.count+" buyers"));
var bData=await authedJson("/api/buyers",undefined,"GET");
if(Array.isArray(bData?.buyers))setDbBuyers(bData.buyers);
}catch(e){toast("Discovery failed: "+(e?.message||"error"))}
finally{setDiscoverRunning(false)}
}

// Skip trace a lead (free, uses public people-finder sites)
async function runSkipTrace(lead){
if(skipTraceId===lead.id)return;
setSkipTraceId(lead.id);
try{
var data=await authedJson("/api/leads/skiptrace",{
name:lead.name,
street:lead.propertyStreet||"",
city:lead.propertyCity,
state:lead.propertyState,
zip:lead.propertyZip||""
});
setSkipTraceResults(function(prev){return Object.assign({},prev,{[lead.id]:data})});
if(data.found){var traceLabel=data.searchedBy==="address"?(lead.propertyStreet||lead.propertyAddress||lead.name):lead.name;toast("\u2713 Skip trace found "+(data.phones?.length||0)+" number"+(data.phones?.length!==1?"s":"")+" for "+traceLabel)}
else{toast(data.message||"No public contact info found.")}
}catch(e){toast("Skip trace failed: "+(e?.message||"error"))}
finally{setSkipTraceId(null)}
}

// Save a skip trace phone/email (and optionally discovered owner name) to a lead
async function saveSkipTraceContact(leadId,phone,email,ownerName){
setLeads(function(prev){return prev.map(function(l){
if(l.id!==leadId)return l;
var updates={};
if(phone&&!l.phone)updates.phone=phone;
if(email&&!l.email)updates.email=email;
// If owner name was a placeholder and we found the real name, update it
if(ownerName&&PLACEHOLDER_NAMES.test((l.name||"").trim()))updates.name=ownerName;
return Object.assign({},l,updates,{activityLog:[].concat(l.activityLog||[],[{time:nowT(),date:td(),action:"Contact info added via skip trace"+(ownerName&&updates.name?"; owner identified as "+ownerName:"")}])});
})});
setSkipTraceResults(function(prev){var n=Object.assign({},prev);delete n[leadId];return n});
toast("Contact info saved to lead!");
// Persist to DB (fire-and-forget; local state already updated)
try{
var dbUpdates={};
if(phone)dbUpdates.phone=phone;
if(email)dbUpdates.email=email;
if(Object.keys(dbUpdates).length>0){
await authedJson("/api/leads/crud",{id:leadId,updates:dbUpdates},"PATCH");
}
}catch(e){/* non-critical — local state already saved */}
}

// Auto-enrich a batch of leads with skip trace data (runs after search results load)
async function autoEnrichLeads(leads){
var toEnrich=leads.filter(function(l){return !l.phone&&l.propertyStreet});
if(!toEnrich.length)return;
setEnriching(true);setEnrichCount(toEnrich.length);
try{
// Process in chunks of 10 (batch endpoint limit)
for(var i=0;i<toEnrich.length;i+=10){
var chunk=toEnrich.slice(i,i+10);
try{
var data=await authedJson("/api/leads/skiptrace-batch",{leads:chunk.map(function(l){return{id:l.id,name:l.name,propertyStreet:l.propertyStreet,propertyCity:l.propertyCity,propertyState:l.propertyState,propertyZip:l.propertyZip}})});
if(Array.isArray(data?.results)){
setSearchResults(function(prev){
return prev.map(function(l){
var r=data.results.find(function(x){return x.leadId===l.id});
if(!r||!r.found)return l;
var updates={};
if(r.phones&&r.phones[0]&&!l.phone)updates.phone=r.phones[0];
if(r.emails&&r.emails[0]&&!l.email)updates.email=r.emails[0];
if(r.ownerName&&PLACEHOLDER_NAMES.test((l.name||"").trim()))updates.name=r.ownerName;
return Object.keys(updates).length?Object.assign({},l,updates):l;
});
});
}
}catch(e){/* chunk failed — continue */}
}
}finally{setEnriching(false);setEnrichCount(0)}
}

// Real comps fetcher
async function fetchRealComps(lead){
try{
var data=await authedJson("/api/comps/search",{
address:lead.propertyAddress,
city:lead.propertyCity,
state:lead.propertyState,
zip:lead.propertyZip,
bedrooms:lead.propData?.bedBath?.split("/")[0],
maxComps:8
});
return{comps:data.comps||[],arvEst:data.arvEst||lead.arv,confidence:data.confidence||0,spread:data.spread||0,source:data.source||"api"};
}catch(e){
toast("Comps unavailable: "+(e?.message||"API error"));
return genComps(lead);
}
}

// Save buyer
async function saveBuyer(){
if(!newBuyer.name){toast("Buyer name required.");return}
try{
var payload={
name:newBuyer.name,company:newBuyer.company,buyer_type:newBuyer.buyer_type,
phone:newBuyer.phone,email:newBuyer.email,
price_min:parseFloat(newBuyer.price_min)||0,
price_max:parseFloat(newBuyer.price_max)||999999,
criteria:newBuyer.criteria?newBuyer.criteria.split(",").map(function(s){return s.trim()}).filter(Boolean):[],
locations:newBuyer.locations?newBuyer.locations.split(",").map(function(s){return s.trim()}).filter(Boolean):[],
rehab_tolerance:newBuyer.rehab_tolerance,financing:newBuyer.financing,notes:newBuyer.notes
};
var data=await authedJson("/api/buyers",payload);
if(data.buyer)setDbBuyers(function(prev){return[].concat(prev,[data.buyer])});
setAddBuyerOpen(false);
setNewBuyer({name:"",company:"",buyer_type:"Fix & Flip",phone:"",email:"",price_min:"",price_max:"",criteria:"",locations:"",rehab_tolerance:"Medium",financing:"Cash",notes:""});
toast("Buyer saved!");
}catch(e){toast("Save failed: "+(e?.message||"error"))}
}

// Delete buyer
async function deleteBuyer(id){
try{
await authedJson("/api/buyers",{id:id},"DELETE");
setDbBuyers(function(prev){return prev.filter(function(b){return b.id!==id})});
toast("Buyer removed.");
}catch(e){toast("Delete failed.")}
}

useEffect(function(){
if(!userId){setProgressLoaded(true);return}
var canceled=false;
(async function(){
try{
var r=await supabase.from("user_progress").select("progress").eq("user_id",userId).maybeSingle();
var p=r?.data?.progress;
if(!canceled&&p){
if(typeof p.tab==="number")setTab(p.tab);
if(typeof p.wO==="boolean")setWO(p.wO);
if(typeof p.fp==="string")setFp(p.fp);
if(typeof p.cf==="string")setCf(p.cf);
if(Array.isArray(p.leads))setLeads(p.leads);
if(typeof p.loc==="string")setLoc(p.loc);
if(p.pipe&&typeof p.pipe==="object")setPipe(p.pipe);
if(Array.isArray(p.tracker))setTracker(p.tracker);
if(p.tasks&&typeof p.tasks==="object")setTasks(p.tasks);
if(p.rehab&&typeof p.rehab==="object")setRehab(p.rehab);
if(typeof p.userName==="string")setUserName(p.userName);
if(typeof p.userCompany==="string")setUserCompany(p.userCompany);
if(typeof p.userPhone2==="string")setUserPhone2(p.userPhone2);
}
}catch(e){
console.warn("progress load failed",e?.message||e)
}finally{
if(!canceled)setProgressLoaded(true);
}
})();
return function(){canceled=true};
},[userId,supabase]);

useEffect(function(){
if(!userId||!progressLoaded)return;
var payload={
tab:tab,wO:wO,fp:fp,cf:cf,
leads:leads,loc:loc,pipe:pipe,tracker:tracker,tasks:tasks,rehab:rehab,
userName:userName,userCompany:userCompany,userPhone2:userPhone2
};
var timer=setTimeout(function(){
supabase.from("user_progress").upsert({user_id:userId,progress:payload,updated_at:new Date().toISOString()}).then(function(){},function(){});
},800);
return function(){clearTimeout(timer)};
},[userId,progressLoaded,tab,city,state,zip,county,lt,price,num,wO,fp,cf,dO,df,dc,leads,loc,pipe,tracker,tasks,rehab,userName,userCompany,userPhone2,supabase]);


const gs=useCallback(function(id){return pipe[id]||"New Lead"},[pipe]);
const ss=useCallback(function(id,s){setPipe(function(p){return Object.assign({},p,{[id]:s})});if(s==="Closed"){var l=leads.find(function(x){return x.id===id});if(l)setTracker(function(t){return[].concat(t,[Object.assign({},l,{closedDate:new Date().toLocaleDateString(),earned:l.deal?.fee||0})])})}
// Log activity
setLeads(function(prev){return prev.map(function(x){return x.id===id?Object.assign({},x,{activityLog:[].concat(x.activityLog||[],[{time:nowT(),date:td(),action:"Stage changed to "+s}])}):x})})},[leads]);
const logC=useCallback(function(id){setLeads(function(p){return p.map(function(l){return l.id===id?Object.assign({},l,{lastContacted:td(),contactCount:(l.contactCount||0)+1,activityLog:[].concat(l.activityLog||[],[{time:nowT(),date:td(),action:"Contact logged"}])}):l})});setPipe(function(p){return!p[id]||p[id]==="New Lead"?Object.assign({},p,{[id]:"Contacted"}):p})},[]);
const updN=useCallback(function(id,n){setLeads(function(p){return p.map(function(l){return l.id===id?Object.assign({},l,{userNotes:n}):l})})},[]);
const addLeadToPipeline=useCallback(function(lead){var added=false;setLeads(function(prev){if(prev.some(function(item){return item.id===lead.id}))return prev;added=true;return[Object.assign({},lead,{activityLog:[].concat(lead.activityLog||[],[{time:nowT(),date:td(),action:"Lead added to saved pipeline"}])})].concat(prev)});if(added){setPipe(function(prev){return prev[lead.id]?prev:Object.assign({},prev,{[lead.id]:"New Lead"})});toast("Lead added to saved pipeline.")}else{toast("Lead already saved in pipeline.")}},[]);
const addAllSearchToPipeline=useCallback(function(){if(!searchResults.length){toast("No search results to add.");return}var addedCount=0;setLeads(function(prev){var existing=new Set(prev.map(function(item){return item.id}));var additions=searchResults.filter(function(item){return!existing.has(item.id)}).map(function(item){addedCount+=1;return Object.assign({},item,{activityLog:[].concat(item.activityLog||[],[{time:nowT(),date:td(),action:"Lead added to saved pipeline"}])})});return additions.concat(prev)});if(addedCount>0){setPipe(function(prev){var next=Object.assign({},prev);searchResults.forEach(function(item){if(!next[item.id])next[item.id]="New Lead"});return next});toast("Added "+addedCount+" lead"+(addedCount===1?"":"s")+" to saved pipeline.")}else{toast("All visible leads are already in the pipeline.")}},[searchResults]);
const buyers=useMemo(function(){return dbBuyers.map(function(b){return Object.assign({},b,{matches:leads.filter(function(l){return l.deal?.offer>=b.pr[0]&&l.deal?.offer<=b.pr[1]})})})},[leads,dbBuyers]);
async function gen(){if(!city&&!state&&!zip&&!county)return;var nextLoc=[city,county?county+" County":"",state,zip].filter(Boolean).join(", ");setLoc(nextLoc);setSearchResults([]);setSearchMeta(null);setLd(true);try{var data=await authedJson("/api/leads/search",{city:city,county:county,state:state,zip:zip,lt:lt,price:price,count:parseInt(num),df:df,dc:parseInt(dc),ft:ft});var nextLeads=Array.isArray(data?.leads)?data.leads:[];var meta=data?.meta||{};setSearchResults(nextLeads);setSearchMeta(meta);if(nextLeads.length>0){var providerLabel=meta.directProviderCount>0?"provider-backed/public-record":"trusted live-source";toast("Loaded "+nextLeads.length+" live lead"+(nextLeads.length===1?"":"s")+" from "+providerLabel+" research.");autoEnrichLeads(nextLeads)}else{toast(meta.noResultsReason||"No verified live leads found. Try a broader area or fewer filters.")}}catch(e){toast((e&&e.message?e.message:"Lead research failed")+" No demo fallback loaded.")}finally{setLd(false)}}

// ANALYTICS CALCULATIONS per blueprint
const std=leads.filter(function(l){return!l.distressed}),dist=leads.filter(function(l){return l.distressed});
const totFee=leads.reduce(function(a,l){return a+(l.deal?.fee||0)},0);
const avgM=leads.length?Math.round(leads.reduce(function(a,l){return a+(l.deal?.mao||0)},0)/leads.length):0;
const stCnt=STAGES.reduce(function(a,s){a[s]=leads.filter(function(l){return gs(l.id)===s}).length;return a},{});
const cEarn=tracker.reduce(function(a,t){return a+(t.earned||0)},0);
const fN=parseFloat(String(ft).replace(/[^0-9.]/g,""))||10000;
// Cost per lead
const totalMktCost=leads.reduce(function(a,l){return a+(l.marketingCost||0)},0);
const costPerLead=leads.length>0?Math.round(totalMktCost/leads.length*100)/100:0;
// Conversion rate
const closedCount=tracker.length;
const convRate=leads.length>0?Math.round(closedCount/leads.length*1000)/10:0;
// Avg deal size
const avgDeal=closedCount>0?Math.round(cEarn/closedCount):0;
// Lead source breakdown
const srcBreak=leads.reduce(function(a,l){var s=l.leadSource||"Other";a[s]=(a[s]||0)+1;return a},{});
const searchStd=searchResults.filter(function(l){return!l.distressed}),searchDist=searchResults.filter(function(l){return l.distressed});
const searchTotFee=searchResults.reduce(function(a,l){return a+(l.deal?.fee||0)},0);
const searchAvgM=searchResults.length?Math.round(searchResults.reduce(function(a,l){return a+(l.deal?.mao||0)},0)/searchResults.length):0;
const searchCostPerLead=searchResults.length>0?Math.round(searchResults.reduce(function(a,l){return a+(l.marketingCost||0)},0)/searchResults.length*100)/100:0;
const searchSrcBreak=searchResults.reduce(function(a,l){var s=l.leadSource||"Other";a[s]=(a[s]||0)+1;return a},{});
const savedLeadIds=useMemo(function(){return new Set(leads.map(function(l){return l.id}))},[leads]);

const dig=useMemo(function(){return leads.map(function(l){return Object.assign({},l,{_s:aScore(l,gs(l.id))})}).filter(function(l){return gs(l.id)!=="Closed"&&gs(l.id)!=="Dead Lead"}).sort(function(a,b){return b._s-a._s}).slice(0,3)},[leads,pipe]);
const searchDig=useMemo(function(){return searchResults.map(function(l){return Object.assign({},l,{_s:aScore(l,gs(l.id))})}).sort(function(a,b){return b._s-a._s}).slice(0,3)},[searchResults,pipe]);
const autoT=useMemo(function(){var t=[];leads.forEach(function(l){var s=gs(l.id);if(s==="New Lead"&&!l.lastContacted)t.push({id:"c-"+l.id,text:(l.phone?"Call ":"Review ")+l.name,b:"hot"});if(s==="Contacted")t.push({id:"f-"+l.id,text:"Follow up: "+l.name,b:"auto"});if(s==="Offer Made")t.push({id:"o-"+l.id,text:"Check offer: "+l.name,b:"hot"});if(s==="Contract Signed")t.push({id:"m-"+l.id,text:"Market to buyers: "+l.name,b:"auto"});if(s==="Mktg to Buyers")t.push({id:"d-"+l.id,text:"Disposition: "+l.name,b:"hot"})});return t.slice(0,10)},[leads,pipe]);
const actD=leads.filter(function(l){return["Offer Made","Contract Signed","Mktg to Buyers","Assigned"].includes(gs(l.id))});
const mGoal=fN*5,gPct=Math.min(100,Math.round(cEarn/mGoal*100)),unc=leads.filter(function(l){return!l.lastContacted&&gs(l.id)==="New Lead"}).length;
const todDate=new Date().toLocaleDateString("en-US",{month:"long",day:"numeric",year:"numeric"});

function expCSV(items){if(!items.length)return;var h=["Name","Type","Score","Heat","Address","Phone","Email","Timeline","Stage","Lead Source","ARV","MAO","Offer","Fee","Motivation","Prop Type","SqFt","Year","Assessed","Mkt Cost"];var rows=items.map(function(l){return[l.name,l.type,aScore(l,gs(l.id)),heatLabel(aScore(l,gs(l.id))),l.propertyAddress,l.phone,l.email,l.timeline,gs(l.id),l.leadSource||"",fmt(l.arv),fmt(l.deal?.mao),fmt(l.deal?.offer),fmt(l.deal?.fee),(l.motivTags||[]).join("; "),l.propData?.propType||"",l.propData?.sqft||"",l.propData?.yearBuilt||"",fmt(l.propData?.assessed),l.marketingCost||0]});var csv=[h].concat(rows).map(function(r){return r.join(",")}).join("\n");var a=document.createElement("a");a.href=URL.createObjectURL(new Blob([csv],{type:"text/csv"}));a.download="leads.csv";a.click();toast("CSV exported!")}

// DEAL BLAST per blueprint
function dealBlast(lead){var matching=buyers.filter(function(b){return lead.deal?.offer>=b.pr[0]&&lead.deal?.offer<=b.pr[1]});if(matching.length===0){toast("No matching buyers for this deal.");return}var sheet=genDealSheet(lead,loc);var emails=matching.map(function(b){return b.email}).join(",");var subj="Wholesale Deal - "+lead.propertyStreet;window.open("mailto:"+emails+"?subject="+encodeURIComponent(subj)+"&body="+encodeURIComponent(sheet));toast("Deal blast to "+matching.length+" buyers!")}

function renderSearchLeadCard(l,isDist){return React.createElement(LCard,{key:l.id,l:l,st:gs(l.id),onSc:function(){setModal({t:"sc",l:l})},onDr:function(){setModal({t:"dr",l:l})},onDe:function(){setDaA("");setDaR("");setDaF("");setDaRes(null);if(!isDist)setRehab(REHAB_CATS.reduce(function(a,c){a[c.k]=c.def;return a},{}));setModal({t:"de",l:l})},onCp:function(){cpy([l.name,l.propertyAddress,l.phone,l.email].filter(Boolean).join("\n"))},onCl:function(){logC(l.id)},onNt:updN,onDS:function(){cpy(genDealSheet(l,loc));toast("Deal sheet copied!")},onAdd:function(){addLeadToPipeline(l)},isAdded:savedLeadIds.has(l.id),onSt:runSkipTrace,stRes:skipTraceResults[l.id]||null,onStClr:function(id){setSkipTraceResults(function(p){var n=Object.assign({},p);delete n[id];return n})},onStSv:saveSkipTraceContact,skipTraceId:skipTraceId})}

function renderSearchSection(items,label,splitClass,isDist){return React.createElement(React.Fragment,null,React.createElement("div",{className:"split",style:isDist?{marginTop:"2rem"}:null},React.createElement("div",{className:"split-line"}),React.createElement("div",{className:"split-txt"+(splitClass?" "+splitClass:"")},label," \u2014 ",items.length),React.createElement("div",{className:"split-line"})),React.createElement("div",{className:"lgrid"},items.slice().sort(function(a,b){return aScore(b,gs(b.id))-aScore(a,gs(a.id))}).map(function(l){return renderSearchLeadCard(l,isDist)})))}


// AI NEGOTIATION ASSISTANT (Claude-powered)
async function aiNegotiate(lead,userMsg){
setAiLoading(true);
setAiChat(function(prev){return prev.concat([{role:"user",text:userMsg}])});
try{
var sysPrompt="You are an expert wholesale real estate negotiation assistant inside a CRM called LeadForge PRO. The wholesaler is negotiating with a seller named "+lead.name+" for property at "+lead.propertyAddress+". Property details: "+(lead.propData?.propType||"SFR")+", "+(lead.propData?.bedBath||"3/2")+", "+(lead.propData?.sqft||"unknown")+" sqft, built "+(lead.propData?.yearBuilt||"unknown")+". ARV: "+fmt(lead.arv)+", Repairs: "+fmt(lead.repairCost)+", MAO: "+fmt(lead.deal?.mao)+", Offer: "+fmt(lead.deal?.offer)+". Seller motivation tags: "+(lead.motivTags||[]).join(", ")+". Timeline: "+lead.timeline+". Notes: "+(lead.userNotes||lead.notes)+". Analyze what the seller said and provide 2-3 specific response suggestions the wholesaler can use. Keep responses practical, empathetic, and focused on moving toward a deal. Format each suggestion on its own line starting with a bullet. Be concise.";
var messages=aiChat.concat([{role:"user",text:userMsg}]).map(function(m){return{role:m.role==="user"?"user":"assistant",content:m.text}});
var data=await authedJson("/api/ai/anthropic",{system:sysPrompt,messages:messages,maxTokens:1000});
var aiText=data?.text||"";
setAiChat(function(prev){return prev.concat([{role:"ai",text:aiText}])});
}catch(err){
setAiChat(function(prev){return prev.concat([{role:"ai",text:"Sorry, I couldn't connect to the AI. Try again in a moment."}])});
}
setAiLoading(false);
}


// ====== SALES COACH AI ======
var COACH_EXERCISES=[
{id:"cold-call",title:"Cold Call Roleplay",ico:"\ud83d\udcde",type:"call",diff:"med",bg:"call",desc:"Practice your cold calling skills. The AI plays a homeowner who may or may not want to sell. Navigate the conversation from opener to close."},
{id:"warm-follow",title:"Warm Follow-Up Call",ico:"\ud83d\udd04",type:"call",diff:"easy",bg:"call",desc:"You called before and left a voicemail. Now they're calling back. Build rapport and move toward an appointment."},
{id:"text-first",title:"First Touch SMS",ico:"\ud83d\udcf1",type:"text",diff:"easy",bg:"text",desc:"Send the perfect first text to a new lead. The seller will respond and you need to get them on a call."},
{id:"text-objection",title:"SMS Objection Handling",ico:"\ud83d\udcf1",type:"text",diff:"hard",bg:"text",desc:"The seller pushes back via text. Handle their objections while keeping the conversation warm and moving forward."},
{id:"email-pitch",title:"Email Outreach",ico:"\u2709\ufe0f",type:"email",diff:"med",bg:"email",desc:"Write a compelling cold email to a motivated seller. The AI will respond as the homeowner."},
{id:"tough-seller",title:"Tough Negotiation",ico:"\ud83d\udcaa",type:"call",diff:"hard",bg:"objection",desc:"The seller has another offer, thinks your price is too low, and wants to list with an agent. Overcome every objection."},
{id:"distressed-empathy",title:"Distressed Seller (Empathy)",ico:"\ud83d\udc94",type:"call",diff:"hard",bg:"objection",desc:"The seller is going through a difficult time (foreclosure/divorce/death). Practice empathetic communication while still moving toward a deal."},
{id:"price-nego",title:"Price Negotiation",ico:"\ud83d\udcb0",type:"call",diff:"med",bg:"objection",desc:"You've made an offer but the seller wants more. Negotiate the gap using value, speed, and convenience."}
];

async function coachSend(exercise,userMsg,history){
setCoachLoading(true);
var newHistory=history.concat([{role:"user",text:userMsg}]);
setCoachChat(newHistory);
var turnCount=newHistory.filter(function(m){return m.role==="user"}).length;
var endSoon=turnCount>=6;

// Offline fallback responses per exercise type
var fallbacks={
"cold-call":[
"Who is this? How did you get my number?",
"I mean... I've thought about selling, but I'm not really sure. What exactly do you do?",
"So you just buy houses? What's the catch? There's always a catch.",
"Well, the house needs some work. The roof is about 10 years old and the kitchen is outdated. What kind of price are we talking?",
"That seems low. My neighbor sold their house for way more than that. Why should I take less?",
"I guess I see your point about the speed and no repairs. Let me talk to my wife about it. Can you send me something in writing? [END]"
],
"warm-follow":[
"Yeah, hi. I got your voicemail the other day. What's this about again?",
"Oh right, the rental property. Yeah, it's been a headache honestly. Tenants just moved out and left the place a mess.",
"How fast are we talking? And you buy it as-is? I don't want to put another dime into that place.",
"What kind of number would you offer? I still owe about $95K on it.",
"That's not bad actually. I was expecting to get lowballed. When could you come look at it?",
"Alright, let's set something up. How about Thursday afternoon? [END]"
],
"text-first":[
"Who is this?",
"How did u get my number",
"Ok. What kind of offer are we talking",
"Idk maybe. The house needs work tho",
"Can u call me tomorrow around 2? Easier to talk on phone",
"Ok sounds good. Talk then [END]"
],
"text-objection":[
"I already have an agent listed with. Not interested.",
"My agent says we can get $280K retail. Your cash offers are always lowball.",
"Why would I sell for less when I can just wait?",
"I don't know... my agent hasn't gotten any offers in 3 weeks though.",
"Fine. What exactly would you offer? And how fast can you actually close?",
"Let me think about it. Send me something official and I'll look it over. [END]"
],
"email-pitch":[
"Thank you for reaching out. I am somewhat interested in selling but need more details. What is your process exactly? How quickly do you close? - Patricia",
"Thank you for explaining. What price range are you thinking? The house was appraised at $210,000 last year. I wouldn't want to sell for significantly less than that.",
"I appreciate the transparency. The roof does need work and the HVAC is old. If you can close in 2-3 weeks as you say, I might be willing to consider your offer. What are the next steps?",
"That sounds reasonable. Please send over a written offer and I will review it with my family. Thank you for being straightforward about the process. [END]"
],
"tough-seller":[
"Look, I appreciate the call, but I already have a cash offer from another investor for $15,000 more than what you guys typically offer.",
"Plus, I talked to a realtor. She said she can list it and get me full retail \u2014 maybe $280K. Why would I leave money on the table?",
"Speed? I'm not in a rush. And certainty? The market is hot right now. Every house is selling.",
"Okay, I hear you about the commissions and closing costs. But that's still not enough to close the gap. What's your absolute best number?",
"You know what, you make some good points about the net proceeds when you factor everything in. But I need to see it on paper.",
"Alright, send me a written comparison \u2014 your offer versus what I'd net after agent fees, repairs, and 90 days on market. If the numbers are close, we can talk. [END]"
],
"distressed-empathy":[
"*sighs* Hello? Look, if you're trying to sell me something, this really isn't a good time.",
"It's just... my husband and I are getting divorced, and the bank is sending letters about the mortgage. I don't even know what to do anymore.",
"I'm scared of getting taken advantage of. Everyone says investors just try to steal houses from people in bad situations.",
"You really think you can help? The bank says we're 3 months behind. I don't even know how much the house is worth anymore.",
"That would actually take a huge weight off my shoulders. I just want this nightmare to be over. What would I need to do?",
"Okay... yes, I think I'd like to explore that. Can you come by this week? And please, just be honest with me. That's all I ask. [END]"
],
"price-nego":[
"Hi. So about your offer of $155K \u2014 I appreciate it, but honestly, I was hoping for closer to $180K.",
"I know it needs some work, but the comps in my neighborhood are going for $220K+. $155K feels like I'm giving it away.",
"What if we met in the middle? Say $170K? That feels more fair to me.",
"$162K? That's still $18K less than what I want. Can you do anything about closing costs?",
"If you cover all closing costs and we close in two weeks, I could do $165K. That's my bottom line.",
"Deal. $165K, you cover closing costs, close in two weeks. Send me the paperwork. [END]"
]};

var responses=fallbacks[exercise.id]||fallbacks["cold-call"];
var idx=Math.min(turnCount-1,responses.length-1);
var aiText=responses[idx]||responses[responses.length-1];

// Try API first, fall back to scripted
try{
var sellerPersona="";
if(exercise.id==="cold-call")sellerPersona="You are a homeowner named Barbara who owns a 3BD/2BA house. You're mildly interested in selling but skeptical of investors. You have a mortgage of about $120K and the house is worth around $200K. You're not in a rush. Start somewhat guarded but warm up if the caller is respectful and knowledgeable.";
else if(exercise.id==="warm-follow")sellerPersona="You are Frank, a homeowner who received a voicemail from an investor. You're calling back out of curiosity. You have a rental property that's been giving you headaches. You're open but want to understand the process before committing.";
else if(exercise.id==="text-first")sellerPersona="You are Maria, a homeowner who just received a text from an investor. You're somewhat interested but busy. Keep responses short like real texts.";
else if(exercise.id==="text-objection")sellerPersona="You are James, pushing back: 'I already have an agent', 'Your offers are always too low'. Make the user work for it.";
else if(exercise.id==="email-pitch")sellerPersona="You are Patricia, a homeowner who received a cold email. Respond as email. Ask about process and price.";
else if(exercise.id==="tough-seller")sellerPersona="You are Robert, a tough negotiator. You have another cash offer for $15K more. Push back hard but be swayed by strong arguments.";
else if(exercise.id==="distressed-empathy")sellerPersona="You are Helen, going through a divorce and facing pre-foreclosure. You're emotional and overwhelmed. Respond emotionally.";
else if(exercise.id==="price-nego")sellerPersona="You are David. An investor offered $155K but you want $180K. Counter-offer and push back on price.";
var commType=exercise.type==="text"?"text messages (keep responses short, realistic SMS style)":exercise.type==="email"?"email format":"a phone conversation (respond naturally)";
var sysPrompt="You are roleplaying as a seller in a wholesale real estate sales training exercise. "+sellerPersona+"\n\nIMPORTANT RULES:\n1. Stay completely in character. Never break character.\n2. This is "+commType+".\n3. React realistically. If they're good, warm up. If pushy, push back.\n4. "+(endSoon?"The conversation has gone "+turnCount+" exchanges. Wrap up naturally - agree, decline, or ask for time. After your response, add [END] on a new line.":"Keep the conversation going.")+"\n5. Do NOT give coaching advice. You ARE the seller.";
var messages=newHistory.map(function(m){return{role:m.role==="user"?"user":"assistant",content:m.text}});
var data=await authedJson("/api/ai/anthropic",{system:sysPrompt,messages:messages,maxTokens:600});
aiText=data?.text||aiText;
}catch(err){
// Use fallback (already set above)
}

var isEnd=aiText.includes("[END]");
aiText=aiText.replace("[END]","").replace(/\[END\]/g,"").trim();

newHistory=newHistory.concat([{role:"seller",text:aiText}]);
setCoachChat(newHistory);

if(isEnd){
setTimeout(function(){scoreExercise(exercise,newHistory)},800);
}
setCoachLoading(false);
}

async function scoreExercise(exercise,history){
setCoachLoading(true);
var convo=history.map(function(m){return(m.role==="user"?"INVESTOR: ":"SELLER: ")+m.text}).join("\n\n");
var userMsgs=history.filter(function(m){return m.role==="user"});
var msgCount=userMsgs.length;
var totalWords=userMsgs.reduce(function(a,m){return a+m.text.split(" ").length},0);
var avgWords=msgCount>0?Math.round(totalWords/msgCount):0;

try{
var scorePrompt="You are an expert wholesale real estate sales coach. A trainee just completed a "+exercise.title+" exercise. Here is their conversation:\n\n"+convo+"\n\nScore their performance from 0-100 and provide detailed feedback. Respond in this exact JSON format only, no other text:\n{\"score\": 75,\"grade\": \"B\",\"summary\": \"One sentence overall assessment\",\"strengths\": [\"strength 1\", \"strength 2\", \"strength 3\"],\"improvements\": [\"improvement 1\", \"improvement 2\", \"improvement 3\"],\"tips\": [\"specific actionable tip 1\", \"specific actionable tip 2\", \"specific actionable tip 3\"]}";
var data=await authedJson("/api/ai/anthropic",{messages:[{role:"user",content:scorePrompt}],maxTokens:800});
var txt=data?.text||"";
txt=txt.replace(/```json|```/g,"").trim();
var result=JSON.parse(txt);
setCoachScore(result);
setCoachExCount(function(p){return p+1});
}catch(err){
// Offline fallback scoring based on basic analysis
var score=50;
var strengths=[];var improvements=[];var tips=[];
if(msgCount>=4)score+=10;
if(avgWords>=15)score+=10;
if(avgWords>=25)score+=5;
var allText=userMsgs.map(function(m){return m.text.toLowerCase()}).join(" ");
if(allText.includes("cash"))score+=5;
if(allText.includes("close")||allText.includes("closing"))score+=5;
if(allText.includes("as-is")||allText.includes("as is"))score+=5;
if(allText.includes("no repairs")||allText.includes("no commission"))score+=5;
if(allText.includes("understand")||allText.includes("appreciate"))score+=5;
if(allText.includes("timeline")||allText.includes("when")||allText.includes("how soon"))score+=3;
if(allText.includes("?")){score+=5;strengths.push("Asked questions to understand the seller's needs")}
if(allText.includes("name is")||allText.includes("my name"))strengths.push("Introduced yourself professionally");
if(allText.includes("cash offer")||allText.includes("cash purchase"))strengths.push("Clearly communicated the cash offer advantage");
if(allText.includes("no pressure")||allText.includes("no obligation"))strengths.push("Used low-pressure language to build trust");
if(allText.includes("help")||allText.includes("solution"))strengths.push("Positioned yourself as a problem-solver");
if(avgWords<12)improvements.push("Your responses were too short. Expand your pitch with more value propositions.");
if(!allText.includes("?"))improvements.push("You didn't ask enough qualifying questions. Always ask about timeline, mortgage, and motivation.");
if(!allText.includes("cash"))improvements.push("Mention 'cash' explicitly. It's one of the biggest advantages you offer.");
if(!allText.includes("close")||!allText.includes("week"))improvements.push("Emphasize your fast closing timeline. Sellers care about speed.");
if(!allText.includes("as-is")&&!allText.includes("no repairs"))improvements.push("Highlight the 'as-is' benefit. Sellers love not having to fix anything.");
tips.push("Always lead with empathy before making your pitch.");
tips.push("Use the '3 Cs' framework: Cash, Convenience, Certainty.");
tips.push("After every objection, validate first, then redirect with a question.");
if(exercise.diff==="hard")tips.push("For tough negotiations, always anchor to the seller's NET proceeds after agent fees, repairs, and carrying costs.");
score=Math.min(95,Math.max(30,score));
var grade=score>=90?"A":score>=80?"B+":score>=70?"B":score>=60?"C+":score>=50?"C":"D";
setCoachScore({score:score,grade:grade,summary:score>=75?"Solid performance with room to sharpen your technique.":score>=55?"Decent foundation but key areas need work.":"Keep practicing \u2014 focus on the fundamentals below.",strengths:strengths.slice(0,3).length>0?strengths.slice(0,3):["You showed up and practiced \u2014 that's the first step"],improvements:improvements.slice(0,3).length>0?improvements.slice(0,3):["Work on building more rapport before pitching"],tips:tips.slice(0,3)});
setCoachExCount(function(p){return p+1});
}
setCoachLoading(false);
}

// RENDER - using React.createElement throughout for Babel compatibility
// Due to extreme length, I'll render the main structure

return React.createElement("div",{className:"app-shell",style:{fontFamily:"var(--ss)",background:"var(--bg)",minHeight:"100vh",color:"var(--fg)"}},

React.createElement("div",{className:"app-watermark","aria-hidden":"true"},
React.createElement("img",{src:"/logo.png",alt:"",className:"app-watermark-img"})
),

// NAV
React.createElement("nav",{className:"nav"},
React.createElement("div",{className:"logo-badge"},
React.createElement("div",{className:"logo"},
React.createElement("img",{src:"/logo.png",alt:"LeadForge PRO"}),
React.createElement("div",{className:"logo-copy"},
React.createElement("div",{className:"logo-title"},"LeadForge PRO"),
React.createElement("div",{className:"logo-subtitle"},"Lead generation, acquisitions, and disposition pipeline")
)
)),
React.createElement("div",{className:"nav-tabs"},TABS.map(function(t,i){return React.createElement("button",{key:i,className:"ntab"+(tab===i?" on":""),onClick:function(){setTab(i)}},t,i===1&&leads.length>0&&React.createElement("span",{className:"nbadge"},leads.length),i===6&&leads.length>0&&React.createElement("span",{className:"nbadge g"},"Go"))})),
React.createElement("button",{
  className:"ntab",
  style:{marginLeft:"auto",opacity:.7,fontSize:".72rem"},
  title:"Wholesale legality by state",
  onClick:function(){setLegalStateDetail(null);setLegalOpen(true)}
},"\u2696\ufe0f Legal"),
React.createElement("button",{
  className:"ntab",
  style:{opacity:.7,fontSize:".72rem"},
  onClick:function(){supabase.auth.signOut().then(function(){window.location.reload();})}
},"\ud83d\udeaa Sign Out")
),

// CONTENT - simplified version showing key new features
// Tab 0: Leads (with all new features)
tab===0&&React.createElement("div",{className:"pg au"},
React.createElement("div",{className:"hero-brand"},
React.createElement("div",{className:"hero-brand-mark"},React.createElement("img",{src:"/logo.png",alt:"LeadForge PRO"})),
React.createElement("div",{style:{fontFamily:"var(--sm)",fontSize:".57rem",letterSpacing:".28em",color:"var(--gold)",textTransform:"uppercase",marginBottom:".5rem"}},"Lead Gen \u00b7 Deal Analysis \u00b7 Negotiation \u00b7 Disposition"),
React.createElement("h1",{style:{fontFamily:"var(--sf)",fontSize:"clamp(1.8rem,4vw,2.8rem)",fontWeight:900,lineHeight:1.06}},"Wholesale Deal",React.createElement("span",{style:{color:"var(--gold)",display:"block"}},"Pipeline CRM."))
),
React.createElement("div",{style:{maxWidth:700,margin:"0 auto 1.5rem"}},
// Wholesaler settings accordion
React.createElement("div",{className:"acc gn"},
React.createElement("div",{className:"acc-h gb",onClick:function(){setWO(function(o){return!o})}},React.createElement("div",{className:"acc-l"},React.createElement("span",null,"\ud83d\udcbc"),React.createElement("div",null,React.createElement("div",{className:"acc-t g"},"Wholesaler Settings"),React.createElement("div",{className:"acc-s g"},"Fee target \u00b7 70% Rule"))),React.createElement("span",{className:"acc-c"+(wO?" o":"")},"\u25bc")),
wO&&React.createElement("div",{className:"acc-b gb"},
React.createElement("p",{style:{fontSize:".8rem",color:"#4a7a40",lineHeight:1.6,marginBottom:".7rem"}},React.createElement("strong",null,"MAO = (ARV \u00d7 70%) \u2212 Repairs"),". Your offer = MAO \u2212 fee."),
React.createElement("div",{className:"fg",style:{marginBottom:".5rem"}},React.createElement("label",null,"Target Fee")),
React.createElement("div",{className:"fp-w"},FP.map(function(p){return React.createElement("div",{key:p,className:"fp"+(fp===p?" on":""),onClick:function(){setFp(p)}},React.createElement("div",{className:"fp-d"}),p)})),
fp==="Custom"&&React.createElement("input",{className:"inp",style:{marginTop:".6rem",maxWidth:180},placeholder:"e.g. 12500",value:cf,onChange:function(e){setCf(e.target.value)}})
)
),
// Search params
React.createElement("div",{className:"card",style:{marginBottom:".8rem"}},
React.createElement("div",{className:"ctitle"},"Search Parameters"),
React.createElement("div",{className:"g4",style:{marginBottom:".75rem"}},
React.createElement("div",{className:"fg"},React.createElement("label",null,"City"),React.createElement("input",{className:"inp",value:city,onChange:function(e){setCity(e.target.value)},placeholder:"City name",onKeyDown:function(e){if(e.key==="Enter")gen()}})),
React.createElement("div",{className:"fg"},React.createElement("label",null,"County"),React.createElement("input",{className:"inp",value:county,onChange:function(e){setCounty(e.target.value)},placeholder:"County name",onKeyDown:function(e){if(e.key==="Enter")gen()}})),
React.createElement("div",{className:"fg"},React.createElement("label",null,"State"),React.createElement("input",{className:"inp",value:state,onChange:function(e){setSt(e.target.value.toUpperCase())},placeholder:"State code",maxLength:2,onKeyDown:function(e){if(e.key==="Enter")gen()}})),
React.createElement("div",{className:"fg"},React.createElement("label",null,"Zip"),React.createElement("input",{className:"inp",value:zip,onChange:function(e){setZip(e.target.value)},placeholder:"ZIP code",maxLength:5,onKeyDown:function(e){if(e.key==="Enter")gen()}}))
),
React.createElement("div",{className:"g3"},
React.createElement("div",{className:"fg"},React.createElement("label",null,"Lead Type"),React.createElement("select",{className:"sel",value:lt,onChange:function(e){setLt(e.target.value)}},React.createElement("option",null,"Sellers Only"),React.createElement("option",null,"Buyers and Sellers"),React.createElement("option",null,"Real Estate Investors"),React.createElement("option",null,"Buyers Only"))),
React.createElement("div",{className:"fg"},React.createElement("label",null,"Price Range"),React.createElement("select",{className:"sel",value:price,onChange:function(e){setPrice(e.target.value)}},React.createElement("option",{value:"any price range"},"Any"),React.createElement("option",{value:"under $300K"},"Under $300K"),React.createElement("option",{value:"$300K\u2013$600K"},"$300K\u2013$600K"),React.createElement("option",{value:"$600K\u2013$1M"},"$600K\u2013$1M"),React.createElement("option",{value:"luxury $1M+"},"$1M+"))),
React.createElement("div",{className:"fg"},React.createElement("label",null,"Count"),React.createElement("select",{className:"sel",value:num,onChange:function(e){setNum(e.target.value)}},React.createElement("option",{value:"5"},"5"),React.createElement("option",{value:"8"},"8"),React.createElement("option",{value:"12"},"12"),React.createElement("option",{value:"20"},"20")))
)
),
// Distressed / List Stacking (EXPANDED per blueprint)
React.createElement("div",{className:"acc",style:{marginBottom:".8rem"}},
React.createElement("div",{className:"acc-h rb",onClick:function(){setDO2(function(o){return!o})}},React.createElement("div",{className:"acc-l"},React.createElement("span",null,"\ud83c\udfe9\ufe0f"),React.createElement("div",null,React.createElement("div",{className:"acc-t r"},"List Stacking & Distressed Filters ",anyD&&React.createElement("span",{style:{fontSize:".65rem",background:"var(--rust)",color:"#fff",borderRadius:3,padding:".08rem .35rem",marginLeft:".3rem",fontFamily:"var(--sm)"}},Object.values(df).filter(Boolean).length)),React.createElement("div",{className:"acc-s r"},"Foreclosure \u00b7 Probate \u00b7 Absentee \u00b7 High Equity \u00b7 Tired Landlord"))),React.createElement("span",{className:"acc-c"+(dO?" o":"")},"\u25bc")),
dO&&React.createElement("div",{className:"acc-b rb"},
React.createElement("p",{style:{fontSize:".79rem",color:"#8a6a4e",lineHeight:1.6,marginBottom:".8rem"}},"Stack multiple distress filters for high-probability targets."),
React.createElement("div",{className:"ckgrid"},DO.map(function(o){return React.createElement("div",{key:o.k,className:"ck"+(df[o.k]?" on":""),onClick:function(){setDf(function(f){var n={};for(var key in f)n[key]=f[key];n[o.k]=!f[o.k];return n})}},React.createElement("div",{className:"ck-b"+(df[o.k]?" on":"")},df[o.k]&&React.createElement("span",{className:"ck-m"},"\u2713")),React.createElement("div",null,React.createElement("div",{className:"ck-l"},o.i," ",o.l),React.createElement("div",{className:"ck-su"},o.s)))})),
anyD&&React.createElement("div",{style:{marginTop:".75rem",display:"flex",alignItems:"center",gap:".6rem"}},React.createElement("span",{style:{fontFamily:"var(--sm)",fontSize:".5rem",letterSpacing:".14em",color:"var(--rust-d)",textTransform:"uppercase"}},"Add"),React.createElement("select",{className:"sel",style:{maxWidth:100},value:dc,onChange:function(e){setDc(e.target.value)}},React.createElement("option",{value:"3"},"3"),React.createElement("option",{value:"4"},"4"),React.createElement("option",{value:"6"},"6"),React.createElement("option",{value:"8"},"8"),React.createElement("option",{value:"10"},"10")))
)
),
React.createElement("button",{className:"gbtn",onClick:gen,disabled:loading||(!city&&!state&&!zip)},loading?"Building Pipeline\u2026":React.createElement(React.Fragment,null,React.createElement("span",null,"Generate Deal Pipeline"),React.createElement("span",null,"\u2192")))
),
// Loading
loading&&React.createElement("div",{style:{textAlign:"center",padding:"3rem"},className:"ai"},React.createElement("div",{className:"spin"}),React.createElement("div",{style:{fontFamily:"var(--sm)",fontSize:".57rem",letterSpacing:".2em",color:"var(--mut)",textTransform:"uppercase"}},"Building Pipeline\u2026")),
// Results
searchResults.length>0&&React.createElement("div",{className:"au"},
React.createElement("div",{style:{display:"flex",alignItems:"flex-end",justifyContent:"space-between",flexWrap:"wrap",gap:".9rem",marginBottom:"1.2rem",paddingBottom:".8rem",borderBottom:"1px solid var(--bdr)"}},
React.createElement("div",null,
React.createElement("div",{style:{fontFamily:"var(--sf)",fontSize:"1.6rem",fontWeight:900}},React.createElement("span",{style:{color:"var(--gold)"}},searchResults.length)," Live Search Results"),
React.createElement("div",{style:{fontFamily:"var(--sm)",fontSize:".55rem",letterSpacing:".13em",color:"var(--mut)",textTransform:"uppercase",marginTop:".18rem"}},loc.toUpperCase(),county?" \u00b7 "+county+" Co.":"","  \u00b7 Fee: ",ft," \u00b7 CPL: $",searchCostPerLead.toFixed(2)),
enriching&&React.createElement("div",{style:{display:"inline-flex",alignItems:"center",gap:".35rem",marginTop:".35rem",fontSize:".72rem",color:"var(--gold)",fontWeight:600}},React.createElement("span",{style:{animation:"spin 1s linear infinite",display:"inline-block"}},"\u23f3"),"Enriching "+enrichCount+" lead"+(enrichCount!==1?"s":"")+" with owner contact info\u2026"),
searchMeta&&React.createElement("div",{style:{display:"flex",gap:".35rem",flexWrap:"wrap",marginTop:".55rem"}},
React.createElement("span",{className:"tag"},"Provider: ",String(searchMeta.provider||"none")),
typeof searchMeta.directProviderCount==="number"&&React.createElement("span",{className:"tag"},searchMeta.directProviderCount," provider-backed"),
searchMeta.aiEnriched&&React.createElement("span",{className:"tag"},"AI enriched"),
searchMeta.providerError&&React.createElement("span",{className:"tag"},searchMeta.providerError)
)
),
React.createElement("div",{style:{display:"flex",gap:".45rem",flexWrap:"wrap"}},
React.createElement("button",{className:"btn btn-ot btn-sm",onClick:function(){expCSV(searchResults)},disabled:!searchResults.length},"Export CSV"),
React.createElement("button",{className:"btn btn-gn btn-sm",onClick:addAllSearchToPipeline,disabled:!searchResults.length},"Add All To Pipeline"),
React.createElement("button",{className:"btn btn-dk btn-sm",onClick:function(){setTab(1)}},"Pipeline \u2192")
)
),
React.createElement("div",{className:"pipebar"},[[searchResults.length,"Total","gd"],[searchDist.length,"Distressed","rs"],[fmt(searchAvgM),"Avg MAO","gd"],[ft,"Fee Target","gn"],[fmt(searchTotFee),"Est. Fees","gn"]].map(function(r){return React.createElement("div",{className:"pip",key:r[1]},React.createElement("div",{className:"pip-n "+r[2]},r[0]),React.createElement("div",{className:"pip-l"},r[1]))})),
React.createElement("div",{style:{display:"flex",gap:".4rem",flexWrap:"wrap",marginBottom:"1rem"}},Object.entries(searchSrcBreak).map(function(e){return React.createElement("span",{key:e[0],className:"src-tag src-"+(e[0]==="Cold Call"?"call":e[0]==="SMS Campaign"?"sms":(e[0]||"").includes("D4D")?"d4d":e[0]==="Direct Mail"?"mail":(e[0]||"").includes("Web")?"web":e[0]==="Referral"?"ref":"skip")},e[0],": ",e[1])})),
searchStd.length>0&&React.createElement(React.Fragment,null,
renderSearchSection(searchStd,"Standard","",false)
),
searchDist.length>0&&React.createElement(React.Fragment,null,
renderSearchSection(searchDist,"\ud83c\udfe9\ufe0f Distressed","rs",true)
)
),
!searchResults.length&&!loading&&React.createElement("div",{className:"empty"},React.createElement("div",{className:"empty-ico"},"\ud83c\udfe1"),React.createElement("div",{className:"empty-t"},"Ready To Search Live Leads"),React.createElement("div",{className:"empty-s"},"Generate live results here, then add the leads you want to keep into the saved pipeline."))
),

// Tab 5: ENHANCED ANALYTICS per blueprint
tab===5&&React.createElement("div",{className:"pg"},
React.createElement("div",{className:"pg-t"},"Deal Profit Dashboard"),
React.createElement("div",{className:"pg-s"},"Assignment fees, conversion rates, cost per lead, marketing ROI, and revenue tracking."),
React.createElement("div",{className:"agrid"},
[[leads.length,"Total Leads","var(--gold)"],[dist.length,"Distressed","var(--rust)"],[fmt(avgM),"Avg MAO","var(--green)"],[fmt(totFee),"Est. Pipeline Fees","var(--gold)"],[tracker.length,"Deals Closed","var(--green)"],[fmt(cEarn),"Fees Earned","var(--gold)"],[convRate+"%","Conversion Rate","var(--blue)"],[fmt(avgDeal),"Avg Deal Size","var(--green)"],[stCnt["Offer Made"]||0,"Offers Out","var(--rust)"],[stCnt["Contract Signed"]||0,"Contracts","var(--blue)"],["$"+costPerLead.toFixed(2),"Cost Per Lead","var(--rust)"],[totalMktCost>0?Math.round(cEarn/Math.max(totalMktCost,1))+"x":"\u2014","Marketing ROI","var(--gold)"]
].map(function(r){return React.createElement("div",{className:"met",key:r[1]},React.createElement("div",{style:{fontFamily:"var(--sf)",fontSize:"1.5rem",fontWeight:900,color:r[2],lineHeight:1,marginBottom:".15rem"}},r[0]),React.createElement("div",{className:"met-l"},r[1]))})),
// Lead source breakdown chart
leads.length>0&&React.createElement("div",{className:"card",style:{marginBottom:"1rem"}},
React.createElement("div",{className:"ctitle"},"Lead Source Breakdown"),
React.createElement("div",{style:{display:"flex",gap:".5rem",flexWrap:"wrap"}},Object.entries(srcBreak).sort(function(a,b){return b[1]-a[1]}).map(function(e){var pct=Math.round(e[1]/leads.length*100);return React.createElement("div",{key:e[0],style:{flex:"1 1 120px",background:"var(--inp)",border:"1px solid var(--bdr)",borderRadius:4,padding:".6rem",textAlign:"center"}},React.createElement("div",{style:{fontFamily:"var(--sf)",fontSize:"1.1rem",fontWeight:900,color:"var(--gold)"}},e[1]),React.createElement("div",{style:{fontFamily:"var(--sm)",fontSize:".42rem",color:"var(--mut)",textTransform:"uppercase",marginTop:".1rem"}},e[0]),React.createElement("div",{style:{fontFamily:"var(--sm)",fontSize:".5rem",color:"var(--blue)",marginTop:".15rem"}},pct,"%"))}))
),
tracker.length>0?React.createElement("div",{className:"card"},
React.createElement("div",{className:"ctitle"},"Closed Deals + Commission Tracking"),
React.createElement("table",{className:"ttbl"},React.createElement("thead",null,React.createElement("tr",null,React.createElement("th",null,"Name"),React.createElement("th",null,"Address"),React.createElement("th",null,"Source"),React.createElement("th",null,"Date"),React.createElement("th",null,"Fee Earned"))),React.createElement("tbody",null,tracker.map(function(t,i){return React.createElement("tr",{key:i},React.createElement("td",null,t.name),React.createElement("td",{style:{fontSize:".75rem",color:"var(--mut)"}},t.propertyStreet),React.createElement("td",null,React.createElement("span",{className:"src-tag src-call",style:{fontSize:".38rem"}},t.leadSource||"N/A")),React.createElement("td",{style:{fontFamily:"var(--sm)",fontSize:".7rem"}},t.closedDate),React.createElement("td",{style:{fontWeight:700,color:"var(--green)"}},fmt(t.earned)))}))),
React.createElement("div",{style:{marginTop:".7rem",fontFamily:"var(--sm)",fontSize:".55rem",color:"var(--green)",textTransform:"uppercase"}},"Total Earned: ",fmt(cEarn)," | Avg: ",fmt(avgDeal)," | ROI: ",totalMktCost>0?Math.round(cEarn/totalMktCost)+"x":"\u2014")
):React.createElement("div",{className:"empty"},React.createElement("div",{className:"empty-ico"},"\ud83d\udcca"),React.createElement("div",{className:"empty-t"},"No Closed Deals"),React.createElement("div",{className:"empty-s"},"Move leads to \"Closed\" in pipeline."))
),

// Remaining tabs render same as before with minimal changes
// Tab 1: Pipeline with 9 stages
tab===1&&React.createElement("div",{className:"pg"},React.createElement("div",{className:"pg-t"},"Deal Pipeline"),React.createElement("div",{className:"pg-s"},"9-stage wholesale funnel. Click cards to advance."),!leads.length?React.createElement("div",{className:"empty"},React.createElement("div",{className:"empty-ico"},"\ud83d\udccb"),React.createElement("div",{className:"empty-t"},"No Leads")):React.createElement("div",{className:"kan"},STAGES.map(function(stage,si){return React.createElement("div",{className:"kcol",key:stage},React.createElement("div",{className:"kch "+KC[si]},React.createElement("span",null,stage),React.createElement("span",{className:"kcnt"},stCnt[stage]||0)),React.createElement("div",{className:"kcs"},leads.filter(function(l){return gs(l.id)===stage}).map(function(l){return React.createElement("div",{key:l.id,className:"kk"+(l.distressed?" di":""),onClick:function(){setModal({t:"kan",l:l})}},React.createElement("div",{className:"kk-n"},l.name),React.createElement("div",{className:"kk-m"},l.propertyStreet||l.area),React.createElement("div",{className:"kk-f"},fmt(l.deal?.fee)," fee"),React.createElement("div",{className:"kkb"},React.createElement("button",{className:"kkbt",onClick:function(e){e.stopPropagation();setModal({t:"sc",l:l})}},"\ud83d\udcdd"),React.createElement("a",{href:"tel:"+l.phone,className:"kkbt",onClick:function(e){e.stopPropagation()},style:{textDecoration:"none"}},"\ud83d\udcde"),React.createElement("button",{className:"kkbt ad",onClick:function(e){e.stopPropagation();var idx=STAGES.indexOf(stage);if(idx<STAGES.length-1)ss(l.id,STAGES[idx+1])}},"Next \u2192")))})))}))),

// Tab 2: FOLLOW-UPS
tab===2&&React.createElement("div",{className:"pg"},React.createElement("div",{className:"pg-t"},"Follow-Up Drips"),React.createElement("div",{className:"pg-s"},"5-touch, 10-day campaigns for every lead."),
!leads.length?React.createElement("div",{className:"empty"},React.createElement("div",{className:"empty-ico"},"\ud83d\udcc5"),React.createElement("div",{className:"empty-t"},"No Leads Yet")):
leads.map(function(l){var steps=bDrip(l,loc),done=l.dripDone||[];return React.createElement("div",{className:"dc",key:l.id},React.createElement("div",{className:"dc-h"},React.createElement("div",null,React.createElement("div",{className:"dc-n"},l.name),React.createElement("div",{className:"dc-s"},(l.distressed?"\ud83c\udfe9\ufe0f ":""),(l.propertyStreet||l.area)," \u00b7 ",done.length,"/",steps.length)),React.createElement("button",{className:"btn btn-gd btn-sm",onClick:function(){cpy(steps.map(function(s){return s.day+"\n"+s.msg}).join("\n\n\u2500\u2500\u2500\n\n"))}},"Copy All")),React.createElement("div",{className:"dc-bd"},steps.map(function(s,si){var dn=done.includes(si);return React.createElement("div",{className:"ds",key:si},React.createElement("div",{className:"dd "+s.cls,style:dn?{background:"var(--green)",color:"#fff"}:{}},dn?"\u2713":s.day.replace("Day ","D")),React.createElement("div",{className:"ds-c"},React.createElement("div",{className:"ds-l"},s.type," \u2014 ",s.label),React.createElement("div",{className:"ds-m",style:dn?{opacity:.5}:{}},s.msg),React.createElement("div",{style:{display:"flex",gap:".35rem",marginTop:".35rem",flexWrap:"wrap"}},React.createElement("button",{className:"btn btn-ot btn-sm",onClick:function(){cpy(s.msg)}},"Copy"),React.createElement("button",{className:"btn btn-sm "+(dn?"btn-ot":"btn-gd"),onClick:function(){setLeads(function(p){return p.map(function(x){return x.id===l.id?Object.assign({},x,{dripDone:dn?done.filter(function(d){return d!==si}):[].concat(done,[si])}):x})});if(!dn)logC(l.id)}},dn?"\u21a9 Undo":"\u2713 Sent"),s.type.includes("Call")&&React.createElement("a",{href:"tel:"+l.phone,className:"btn btn-bl btn-sm",style:{textDecoration:"none"},onClick:function(){logC(l.id)}},"\ud83d\udcde"),s.type.includes("Text")&&React.createElement("a",{href:"sms:"+l.phone,className:"btn btn-dk btn-sm",style:{textDecoration:"none"}},"\ud83d\udcac"))))})))})),

// Tab 3: BUYERS (loaded from database)
tab===3&&React.createElement("div",{className:"pg"},React.createElement("div",{className:"pg-t"},"Cash Buyer\u2019s List"),React.createElement("div",{className:"pg-s"},"Your buyer database. Auto-matched against your pipeline leads."),
React.createElement("div",{style:{display:"flex",gap:".5rem",flexWrap:"wrap",marginBottom:"1rem"}},
React.createElement("button",{className:"btn btn-gd btn-sm",onClick:function(){setAddBuyerOpen(true)}},"\u2795 Add Buyer"),
React.createElement("button",{className:"btn btn-dk btn-sm",onClick:function(){setDiscoverOpen(function(o){return!o})},style:{background:"rgba(201,168,76,.15)",border:"1px solid rgba(201,168,76,.3)",color:"var(--gold)"}},"\ud83d\udd0d Discover Buyers"),
autoRunning&&React.createElement("span",{style:{alignSelf:"center",fontSize:".75rem",color:"var(--mut)"}},"Auto-research running…")),
discoverOpen&&React.createElement("div",{className:"card",style:{marginBottom:"1rem",border:"1px solid rgba(201,168,76,.25)"}},
React.createElement("div",{className:"ctitle",style:{color:"var(--gold)"}},"🔍 Discover Cash Buyers"),
React.createElement("div",{style:{fontSize:".78rem",color:"var(--mut)",marginBottom:".7rem"}},"Search for active cash buyers and investor companies in any market. We pull from web search, RentCast property records, and recent cash sales."),
React.createElement("div",{style:{display:"flex",gap:".5rem",marginBottom:".6rem",flexWrap:"wrap"}},
React.createElement("input",{className:"inp",placeholder:"City *",value:discoverCity,onChange:function(e){setDiscoverCity(e.target.value)},style:{flex:2,minWidth:120}}),
React.createElement("select",{className:"inp",value:discoverState,onChange:function(e){setDiscoverState(e.target.value)},style:{flex:1,minWidth:80}},
React.createElement("option",{value:""},"— Select State —"),US_STATES.map(function(s){return React.createElement("option",{key:s.c,value:s.c},(STATE_LEGAL[s.c]?.level==="danger"?"🔴 ":STATE_LEGAL[s.c]?.level==="warn"?"🟡 ":"🟢 ")+s.n+" ("+s.c+")")})),
React.createElement("button",{className:"btn btn-dk",disabled:discoverRunning,onClick:runDiscoverBuyers,style:{flexShrink:0}},discoverRunning?"\u23f3 Searching…":"Find Buyers")),
STATE_LEGAL[discoverState]&&STATE_LEGAL[discoverState].level!=="ok"&&React.createElement("div",{style:{padding:".5rem .7rem",background:STATE_LEGAL[discoverState].level==="danger"?"rgba(220,50,50,.1)":"rgba(220,160,50,.1)",border:"1px solid "+(STATE_LEGAL[discoverState].level==="danger"?"#e05050":"#c9a84c"),borderRadius:6,fontSize:".73rem",color:STATE_LEGAL[discoverState].level==="danger"?"#ff8080":"var(--gold)",marginBottom:".6rem",cursor:"pointer"},onClick:function(){setLegalStateDetail(discoverState);setLegalOpen(true)}},
(STATE_LEGAL[discoverState].level==="danger"?"\ud83d\udd34 ":"\ud83d\udfe1 "),STATE_LEGAL[discoverState].short," ",React.createElement("span",{style:{textDecoration:"underline",opacity:.7}},"Learn more")),
discoverResult&&React.createElement("div",{style:{padding:".5rem .7rem",background:"rgba(255,255,255,.04)",borderRadius:6,fontSize:".8rem",color:"var(--gold)"}},"\u2713 ",discoverResult.message||("Found "+discoverResult.count+" buyers — saved to your list"))),
React.createElement("button",{className:"btn btn-gd btn-sm",style:{marginBottom:"1rem"},onClick:function(){setAddBuyerOpen(true)}},"\u2795 Add Buyer"),
addBuyerOpen&&React.createElement("div",{className:"card",style:{marginBottom:"1rem"}},
React.createElement("div",{className:"ctitle"},"\u2795 New Buyer"),
React.createElement("div",{className:"g2",style:{marginBottom:".6rem"}},
React.createElement("div",{className:"fg"},React.createElement("label",null,"Name *"),React.createElement("input",{className:"inp",value:newBuyer.name,onChange:function(e){setNewBuyer(Object.assign({},newBuyer,{name:e.target.value}))},placeholder:"Buyer name"})),
React.createElement("div",{className:"fg"},React.createElement("label",null,"Company"),React.createElement("input",{className:"inp",value:newBuyer.company,onChange:function(e){setNewBuyer(Object.assign({},newBuyer,{company:e.target.value}))},placeholder:"Company name"}))
),
React.createElement("div",{className:"g3",style:{marginBottom:".6rem"}},
React.createElement("div",{className:"fg"},React.createElement("label",null,"Phone"),React.createElement("input",{className:"inp",value:newBuyer.phone,onChange:function(e){setNewBuyer(Object.assign({},newBuyer,{phone:e.target.value}))},placeholder:"(555) 000-0000"})),
React.createElement("div",{className:"fg"},React.createElement("label",null,"Email"),React.createElement("input",{className:"inp",value:newBuyer.email,onChange:function(e){setNewBuyer(Object.assign({},newBuyer,{email:e.target.value}))},placeholder:"email@domain.com"})),
React.createElement("div",{className:"fg"},React.createElement("label",null,"Type"),React.createElement("select",{className:"sel",value:newBuyer.buyer_type,onChange:function(e){setNewBuyer(Object.assign({},newBuyer,{buyer_type:e.target.value}))}},React.createElement("option",null,"Fix & Flip"),React.createElement("option",null,"Buy & Hold"),React.createElement("option",null,"Turnkey"),React.createElement("option",null,"Wholesale"),React.createElement("option",null,"Land")))
),
React.createElement("div",{className:"g3",style:{marginBottom:".6rem"}},
React.createElement("div",{className:"fg"},React.createElement("label",null,"Min Price ($)"),React.createElement("input",{className:"inp",type:"number",value:newBuyer.price_min,onChange:function(e){setNewBuyer(Object.assign({},newBuyer,{price_min:e.target.value}))},placeholder:"80000"})),
React.createElement("div",{className:"fg"},React.createElement("label",null,"Max Price ($)"),React.createElement("input",{className:"inp",type:"number",value:newBuyer.price_max,onChange:function(e){setNewBuyer(Object.assign({},newBuyer,{price_max:e.target.value}))},placeholder:"300000"})),
React.createElement("div",{className:"fg"},React.createElement("label",null,"Financing"),React.createElement("select",{className:"sel",value:newBuyer.financing,onChange:function(e){setNewBuyer(Object.assign({},newBuyer,{financing:e.target.value}))}},React.createElement("option",null,"Cash"),React.createElement("option",null,"Hard Money"),React.createElement("option",null,"Conventional"),React.createElement("option",null,"Cash/Hard Money")))
),
React.createElement("div",{className:"g2",style:{marginBottom:".6rem"}},
React.createElement("div",{className:"fg"},React.createElement("label",null,"Locations (comma-separated)"),React.createElement("input",{className:"inp",value:newBuyer.locations,onChange:function(e){setNewBuyer(Object.assign({},newBuyer,{locations:e.target.value}))},placeholder:"Tampa, St Pete, Clearwater"})),
React.createElement("div",{className:"fg"},React.createElement("label",null,"Criteria (comma-separated)"),React.createElement("input",{className:"inp",value:newBuyer.criteria,onChange:function(e){setNewBuyer(Object.assign({},newBuyer,{criteria:e.target.value}))},placeholder:"SFR, needs work, close 14d"}))
),
React.createElement("div",{style:{display:"flex",gap:".4rem"}},
React.createElement("button",{className:"btn btn-gd btn-sm",onClick:saveBuyer},"Save Buyer"),
React.createElement("button",{className:"btn btn-ot btn-sm",onClick:function(){setAddBuyerOpen(false)}},"Cancel"))
),
buyers.length===0&&!addBuyerOpen?React.createElement("div",{className:"empty"},React.createElement("div",{className:"empty-ico"},"\ud83c\udfe6"),React.createElement("div",{className:"empty-t"},"No Buyers Yet"),React.createElement("div",{className:"empty-s"},"Add your cash buyers above to auto-match with pipeline leads.")):
React.createElement("div",{className:"bgrid"},buyers.map(function(b){return React.createElement("div",{className:"bc",key:b.id},React.createElement("div",{className:"bc-h"},React.createElement("div",null,React.createElement("div",{className:"bc-n"},b.name,b.company?" \u00b7 "+b.company:""),React.createElement("div",{className:"bc-tp"},b.type," \u00b7 ",b.deals||0," deals")),React.createElement("div",{className:"bc-mt"},b.matches.length)),React.createElement("div",{className:"bc-bd"},React.createElement("div",{className:"g2",style:{marginBottom:".6rem"}},React.createElement("div",{className:"fg"},React.createElement("label",null,"Phone"),React.createElement("div",{style:{fontSize:".8rem"}},b.phone?React.createElement("a",{href:"tel:"+b.phone,style:{color:"#1a6a30",textDecoration:"none"}},b.phone):React.createElement("span",{style:{color:"var(--mut)"}},"Not set"))),React.createElement("div",{className:"fg"},React.createElement("label",null,"Range"),React.createElement("div",{style:{fontSize:".8rem",fontWeight:600}},"$"+(b.pr[0]/1000).toFixed(0)+"K\u2013$"+(b.pr[1]/1000).toFixed(0)+"K"))),React.createElement("div",{className:"fg",style:{marginBottom:".4rem"}},React.createElement("label",null,"Email"),React.createElement("div",{style:{fontSize:".78rem"}},b.email?React.createElement("a",{href:"mailto:"+b.email,style:{color:"var(--blue)",textDecoration:"none"}},b.email):React.createElement("span",{style:{color:"var(--mut)"}},"Not set"))),React.createElement("div",{className:"g3",style:{marginBottom:".5rem"}},React.createElement("div",{className:"fg"},React.createElement("label",null,"Locations"),React.createElement("div",{style:{fontSize:".72rem"}},(b.locations||[]).join(", ")||"Any")),React.createElement("div",{className:"fg"},React.createElement("label",null,"Rehab Tol."),React.createElement("div",{style:{fontSize:".72rem"}},b.rehabTol||"Any")),React.createElement("div",{className:"fg"},React.createElement("label",null,"Financing"),React.createElement("div",{style:{fontSize:".72rem"}},b.financing||"Cash"))),React.createElement("div",{style:{marginBottom:".5rem"}},(b.criteria||[]).map(function(c){return React.createElement("span",{className:"btag",key:c},c)})),b.matches.length>0&&React.createElement("div",{className:"mbox"},React.createElement("div",{className:"mbox-t"},"\u2705 Matching (",b.matches.length,")"),b.matches.slice(0,3).map(function(l){return React.createElement("div",{className:"mbox-r",key:l.id},React.createElement("span",null,l.name),React.createElement("span",{style:{fontWeight:700,color:"var(--green)"}},fmt(l.deal?.offer)))})),React.createElement("div",{style:{display:"flex",gap:".35rem",marginTop:".7rem"}},React.createElement("button",{className:"btn btn-ot btn-sm",onClick:function(){cpy(b.name+"\n"+(b.phone||"")+"\n"+(b.email||""))}},"Copy"),b.matches.length>0&&React.createElement("button",{className:"btn btn-gn btn-sm",onClick:function(){setModal({t:"bp",buyer:b,matches:b.matches})}},"Send Deals \u2192"),React.createElement("button",{className:"btn btn-sm",style:{background:"transparent",border:"1px solid var(--rust)",color:"var(--rust)",fontSize:".68rem"},onClick:function(){if(confirm("Remove "+b.name+"?"))deleteBuyer(b.id)}},"\u2715"))))})),
),

// Tab 4: CONTRACTS
tab===4&&(function(){var w=cxW||"[Wholesaler]",bn=cxB||"[Buyer]",fd=cxF||ft,l=cxL,sel=l?.name||"[Seller]",addr=l?.propertyAddress||"[Address]",off=l?.deal?.offer?fmt(l.deal.offer):"[Offer]",cd2=new Date(Date.now()+21*86400000).toLocaleDateString();
var ct="ASSIGNMENT CONTRACT\nDate: "+todDate+"\n\nAssignor: "+w+"\nAssignee: "+bn+"\nSeller: "+sel+"\nProperty: "+addr+"\n\nPurchase Price: "+off+"\nAssignment Fee: "+fd+"\nEarnest: $1,000\nInspection: 7 days\nClosing: "+cd2+"\n\nTERMS\n1. Sold AS-IS\n2. All rights assigned\n3. Fee due at closing\n4. Time is of essence\n5. Due diligence completed/waived\n6. Clear title required\n\nSIGNATURES\n\nAssignor: "+w+"\nSign: _______________ Date: ______\n\nAssignee: "+bn+"\nSign: _______________ Date: ______\n\nSeller: "+sel+"\nSign: _______________ Date: ______\n\n\u26a0\ufe0f EDUCATIONAL USE ONLY";
return React.createElement("div",{className:"pg"},React.createElement("div",{className:"pg-t"},"Contract Generator"),React.createElement("div",{className:"pg-s"},"Fill in details \u2014 contract populates automatically."),React.createElement("div",{style:{maxWidth:820,margin:"0 auto"}},React.createElement("div",{className:"card",style:{marginBottom:"1rem"}},React.createElement("div",{className:"ctitle"},"Details"),React.createElement("div",{className:"g2",style:{marginBottom:".75rem"}},React.createElement("div",{className:"fg"},React.createElement("label",null,"Your Name"),React.createElement("input",{className:"inp",placeholder:"Acme LLC",value:cxW,onChange:function(e){setCxW(e.target.value)}})),React.createElement("div",{className:"fg"},React.createElement("label",null,"Buyer"),React.createElement("input",{className:"inp",placeholder:"John Smith",value:cxB,onChange:function(e){setCxB(e.target.value)}}))),React.createElement("div",{className:"g2",style:{marginBottom:".75rem"}},React.createElement("div",{className:"fg"},React.createElement("label",null,"Seller"),React.createElement("select",{className:"sel",value:cxL?.id||"",onChange:function(e){setCxL(leads.find(function(x){return x.id===e.target.value})||null)}},React.createElement("option",{value:""},"\u2014 Select \u2014"),leads.map(function(l){return React.createElement("option",{key:l.id,value:l.id},l.name," \u2014 ",l.propertyStreet)}))),React.createElement("div",{className:"fg"},React.createElement("label",null,"Fee"),React.createElement("input",{className:"inp",placeholder:ft,value:cxF,onChange:function(e){setCxF(e.target.value)}}))),React.createElement("div",{style:{display:"flex",gap:".5rem"}},React.createElement("button",{className:"btn btn-dk btn-sm",onClick:function(){cpy(ct)}},"Copy"),React.createElement("button",{className:"btn btn-gd btn-sm",onClick:function(){var a=document.createElement("a");a.href=URL.createObjectURL(new Blob([ct],{type:"text/plain"}));a.download="contract.txt";a.click();toast("Downloaded!")}},"Download"))),React.createElement("div",{style:{background:"#fff",border:"2px solid var(--bdr)",borderRadius:"var(--r)",padding:"2rem",lineHeight:1.8,fontSize:".84rem",whiteSpace:"pre-wrap"}},ct)))})(),

// Tab 6: COMMAND CENTER
tab===6&&React.createElement("div",{className:"pg"},React.createElement("div",{className:"pg-t"},"\u26a1 Command Center"),React.createElement("div",{className:"pg-s"},"Your daily action plan."),
React.createElement("div",{className:"ccrd"},React.createElement("div",{style:{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:".4rem"}},React.createElement("div",{style:{fontFamily:"var(--sm)",fontSize:".5rem",letterSpacing:".16em",color:"var(--mut)",textTransform:"uppercase"}},"Monthly Goal"),React.createElement("div",{style:{fontFamily:"var(--sf)",fontWeight:900,fontSize:"1rem",color:"var(--gold)"}},fmt(cEarn)," ",React.createElement("span",{style:{fontSize:".7rem",fontWeight:400,color:"var(--mut)"}},"of ",fmt(mGoal)))),React.createElement("div",{className:"gbar"},React.createElement("div",{className:"gfill",style:{width:gPct+"%"}})),React.createElement("div",{style:{fontSize:".7rem",color:"var(--mut)"}},gPct,"% \u00b7 ",tracker.length," closed")),
dig.length>0?React.createElement("div",{className:"cp"},React.createElement("div",{style:{fontFamily:"var(--sm)",fontSize:".5rem",letterSpacing:".2em",color:"var(--gold)",textTransform:"uppercase",marginBottom:".8rem"}},"\ud83c\udfaf Today\u2019s Top Contacts"),dig.map(function(l,i){return React.createElement("div",{className:"pr",key:l.id},React.createElement("div",{className:"pr-n"},i+1),React.createElement("div",{className:"pr-i"},React.createElement("div",{className:"pr-nm"},l.name),React.createElement("div",{style:{fontSize:".73rem",color:"var(--mut)",marginTop:".1rem"}},l.propertyStreet||l.area),React.createElement("div",{className:"pr-w"},"Score ",l._s," \u00b7 ",l.type,!l.lastContacted?" \u00b7 \u26a1":"")),React.createElement("div",{style:{display:"flex",gap:".35rem",flexShrink:0}},React.createElement("a",{href:"tel:"+l.phone,style:{padding:".35rem .6rem",background:"var(--gold)",color:"var(--fg)",borderRadius:4,fontSize:".68rem",fontWeight:700,textDecoration:"none"}},"\ud83d\udcde"),React.createElement("button",{onClick:function(){setModal({t:"sc",l:l})},style:{padding:".35rem .5rem",background:"transparent",border:"1px solid rgba(255,255,255,.1)",color:"var(--mut)",borderRadius:4,fontSize:".65rem",cursor:"pointer"}},"\ud83d\udcdd")))})):React.createElement("div",{className:"ccrd",style:{textAlign:"center",padding:"1.5rem"}},React.createElement("div",{style:{fontSize:"1.5rem",marginBottom:".5rem"}},"\ud83c\udfaf"),React.createElement("div",{style:{color:"var(--mut)"}},"Generate leads first."),React.createElement("button",{className:"btn btn-dk btn-sm",style:{marginTop:".7rem"},onClick:function(){setTab(0)}},"Leads \u2192")),
React.createElement("div",{style:{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"1rem",alignItems:"start"}},React.createElement("div",{className:"ccrd"},React.createElement("div",{className:"ctitle"},"\u26a1 Tasks"),autoT.length===0?React.createElement("div",{style:{fontSize:".8rem",color:"var(--mut)"}},"All caught up!"):autoT.map(function(t){return React.createElement("div",{className:"tr",key:t.id,onClick:function(){setTasks(function(p){return Object.assign({},p,{[t.id]:!p[t.id]})})}},React.createElement("div",{className:"tch"+(tasks[t.id]?" dn":"")},tasks[t.id]&&React.createElement("span",{style:{color:"#fff",fontSize:".6rem",fontWeight:900}},"\u2713")),React.createElement("div",{className:"ttx"+(tasks[t.id]?" dn":"")},t.text,React.createElement("span",{className:"tbd "+(t.b==="hot"?"tbd-h":"tbd-a")},t.b==="hot"?"Urgent":"Auto")))})),React.createElement("div",{className:"ccrd"},React.createElement("div",{className:"ctitle"},"\ud83d\udcc8 30-Day"),React.createElement("div",{className:"rvg"},React.createElement("div",{className:"rpb"},React.createElement("div",{className:"rpb-n"},actD.length),React.createElement("div",{className:"rpb-l"},"Active")),React.createElement("div",{className:"rpb"},React.createElement("div",{className:"rpb-n"},fmt2(actD.length*fN*.45)),React.createElement("div",{className:"rpb-l"},"Proj. Fees")),React.createElement("div",{className:"rpb"},React.createElement("div",{className:"rpb-n"},unc),React.createElement("div",{className:"rpb-l"},"Uncalled"))))))

,

// ── MARKETS MANAGER ──────────────────────────────────────────────
React.createElement("div",{className:"acc gn",style:{marginTop:"1rem"}},
React.createElement("div",{className:"acc-h gb",onClick:function(){setMarketsOpen(function(o){return!o})}},
React.createElement("div",{className:"acc-l"},React.createElement("span",null,"\ud83c\udf0e"),React.createElement("div",null,React.createElement("div",{className:"acc-t g"},"Target Markets"),React.createElement("div",{className:"acc-s g"},markets.length===0?"No markets configured — add one to enable auto-research":markets.length+" market"+(markets.length!==1?"s":"")+" configured"))),
React.createElement("span",{className:"acc-c"+(marketsOpen?" o":"")},"\u25bc")),
marketsOpen&&React.createElement("div",{className:"acc-b gb"},
markets.length===0&&React.createElement("div",{style:{color:"var(--mut)",fontSize:".8rem",marginBottom:".8rem"}},"Add your target markets below. LeadForge PRO will auto-research leads and buyers in each market."),
markets.map(function(m){return React.createElement("div",{key:m.id,style:{display:"flex",justifyContent:"space-between",alignItems:"center",padding:".5rem .7rem",background:"rgba(255,255,255,.04)",border:"1px solid rgba(255,255,255,.08)",borderRadius:6,marginBottom:".4rem"}},
React.createElement("div",null,
React.createElement("div",{style:{fontWeight:700,fontSize:".88rem"}},m.city+", "+m.state+(m.zip?" "+m.zip:"")),
React.createElement("div",{style:{fontSize:".72rem",color:"var(--mut)"}},m.price_range+" \u00b7 Fee: "+m.fee_target+(m.last_researched?" \u00b7 Last: "+new Date(m.last_researched).toLocaleDateString():" \u00b7 Not yet run"))),
React.createElement("button",{onClick:function(){deleteMarket(m.id)},style:{background:"transparent",border:"none",color:"#e05050",cursor:"pointer",fontSize:"1rem",padding:".2rem .4rem"}},"\u2715"));}),
addMarketOpen?React.createElement("div",{style:{marginTop:".8rem",display:"grid",gridTemplateColumns:"1fr 1fr",gap:".5rem"}},
React.createElement("input",{className:"inp",placeholder:"City *",value:newMarket.city,onChange:function(e){setNewMarket(function(p){return Object.assign({},p,{city:e.target.value})})}}),
React.createElement("select",{className:"inp",value:newMarket.state,onChange:function(e){setNewMarket(function(p){return Object.assign({},p,{state:e.target.value})})}},
React.createElement("option",{value:""},"— Select State —"),US_STATES.map(function(s){return React.createElement("option",{key:s.c,value:s.c},(STATE_LEGAL[s.c]?.level==="danger"?"🔴 ":STATE_LEGAL[s.c]?.level==="warn"?"🟡 ":"🟢 ")+s.n+" ("+s.c+")")})),
React.createElement("input",{className:"inp",placeholder:"ZIP (optional)",value:newMarket.zip,onChange:function(e){setNewMarket(function(p){return Object.assign({},p,{zip:e.target.value})})}}),
React.createElement("select",{className:"inp",value:newMarket.price_range,onChange:function(e){setNewMarket(function(p){return Object.assign({},p,{price_range:e.target.value})})}},
["any price range","under $300K","$300K\u2013$600K","$600K\u2013$1M","luxury $1M+"].map(function(r){return React.createElement("option",{key:r,value:r},r)})),
React.createElement("select",{className:"inp",value:newMarket.fee_target,onChange:function(e){setNewMarket(function(p){return Object.assign({},p,{fee_target:e.target.value})})}},
["$5,000","$8,000","$10,000","$15,000","$20,000"].map(function(f){return React.createElement("option",{key:f,value:f},f)})),
React.createElement("select",{className:"inp",value:newMarket.lead_types,onChange:function(e){setNewMarket(function(p){return Object.assign({},p,{lead_types:e.target.value})})}},
["Sellers Only","Buyers Only","Buyers and Sellers","Distressed Only"].map(function(t){return React.createElement("option",{key:t,value:t},t)})),
STATE_LEGAL[newMarket.state]&&STATE_LEGAL[newMarket.state].level!=="ok"&&React.createElement("div",{style:{gridColumn:"1/-1",padding:".6rem .8rem",background:STATE_LEGAL[newMarket.state].level==="danger"?"rgba(220,50,50,.15)":"rgba(220,160,50,.12)",border:"1px solid "+(STATE_LEGAL[newMarket.state].level==="danger"?"#e05050":"#c9a84c"),borderRadius:6,fontSize:".75rem",color:STATE_LEGAL[newMarket.state].level==="danger"?"#ff8080":"var(--gold)",cursor:"pointer"},onClick:function(){setLegalStateDetail(newMarket.state);setLegalOpen(true)}},
(STATE_LEGAL[newMarket.state].level==="danger"?"\ud83d\udd34 ":"\ud83d\udfe1 "),STATE_LEGAL[newMarket.state].short," ",React.createElement("span",{style:{textDecoration:"underline",opacity:.7}},"View full legal details")),
React.createElement("div",{style:{gridColumn:"1/-1",display:"flex",gap:".5rem"}},
React.createElement("button",{className:"btn btn-dk",onClick:saveMarket},"Add Market"),
React.createElement("button",{className:"btn",style:{opacity:.6},onClick:function(){setAddMarketOpen(false)}},"Cancel"))
):React.createElement("button",{className:"btn btn-dk",style:{marginTop:".6rem"},onClick:function(){setAddMarketOpen(true)}},"\u002b Add Market")
))

,

// ── AUTOMATION MODE ──────────────────────────────────────────────
React.createElement("div",{className:"acc gn",style:{marginTop:"1rem"}},
React.createElement("div",{className:"acc-h gb",onClick:function(){setAutoSettingsOpen(function(o){return!o})}},
React.createElement("div",{className:"acc-l"},
React.createElement("span",null,autoSettings.auto_mode?"\ud83e\udd16":"\u23f8\ufe0f"),
React.createElement("div",null,
React.createElement("div",{className:"acc-t g"},"Automation Mode"),
React.createElement("div",{className:"acc-s g"},autoSettings.auto_mode?"Auto-research is ON \u2014 runs every "+autoSettings.frequency_hours+"h":"Auto-research is OFF \u2014 runs on demand only"))),
React.createElement("div",{style:{display:"flex",alignItems:"center",gap:".5rem",marginLeft:"auto"}},
React.createElement("span",{style:{fontSize:".72rem",color:autoSettings.auto_mode?"var(--gold)":"var(--mut)"}},autoSettings.auto_mode?"ON":"OFF"),
React.createElement("div",{
onClick:function(e){e.stopPropagation();saveAutoSettings({auto_mode:!autoSettings.auto_mode})},
style:{width:36,height:20,borderRadius:10,background:autoSettings.auto_mode?"var(--gold)":"rgba(255,255,255,.15)",cursor:"pointer",position:"relative",transition:"background .2s"}
},React.createElement("div",{style:{position:"absolute",top:3,left:autoSettings.auto_mode?18:3,width:14,height:14,borderRadius:"50%",background:"#fff",transition:"left .2s"}})))),
autoSettingsOpen&&React.createElement("div",{className:"acc-b gb"},
React.createElement("div",{style:{display:"grid",gridTemplateColumns:"1fr 1fr",gap:".7rem",marginBottom:"1rem"}},
React.createElement("div",null,React.createElement("label",{style:{fontSize:".72rem",color:"var(--mut)",display:"block",marginBottom:".3rem"}},"Research Frequency"),
React.createElement("select",{className:"inp",value:autoSettings.frequency_hours,onChange:function(e){saveAutoSettings({frequency_hours:Number(e.target.value)})}},
[{v:6,l:"Every 6 hours"},{v:12,l:"Every 12 hours"},{v:24,l:"Daily"},{v:48,l:"Every 2 days"},{v:168,l:"Weekly"}].map(function(o){return React.createElement("option",{key:o.v,value:o.v},o.l)}))),
React.createElement("div",null,React.createElement("label",{style:{fontSize:".72rem",color:"var(--mut)",display:"block",marginBottom:".3rem"}},"Follow-Up Flag (days)"),
React.createElement("input",{className:"inp",type:"number",min:1,max:30,value:autoSettings.auto_followup_days,onChange:function(e){saveAutoSettings({auto_followup_days:Number(e.target.value)})}})),
React.createElement("div",null,React.createElement("label",{style:{fontSize:".72rem",color:"var(--mut)",display:"block",marginBottom:".3rem"}},"Dead Lead After (days)"),
React.createElement("input",{className:"inp",type:"number",min:7,max:90,value:autoSettings.auto_dead_days,onChange:function(e){saveAutoSettings({auto_dead_days:Number(e.target.value)})}})),
React.createElement("div",{style:{display:"flex",flexDirection:"column",gap:".4rem"}},
React.createElement("label",{style:{fontSize:".72rem",color:"var(--mut)"}},"Auto Options"),
React.createElement("label",{style:{display:"flex",alignItems:"center",gap:".5rem",fontSize:".8rem",cursor:"pointer"}},
React.createElement("input",{type:"checkbox",checked:autoSettings.auto_buyers!==false,onChange:function(e){saveAutoSettings({auto_buyers:e.target.checked})}}),
"Auto-discover buyers"),
React.createElement("label",{style:{display:"flex",alignItems:"center",gap:".5rem",fontSize:".8rem",cursor:"pointer"}},
React.createElement("input",{type:"checkbox",checked:autoSettings.auto_stage!==false,onChange:function(e){saveAutoSettings({auto_stage:e.target.checked})}}),
"Auto-stage stale leads"))),
autoResult&&React.createElement("div",{style:{fontSize:".78rem",color:"var(--gold)",marginBottom:".7rem",padding:".5rem",background:"rgba(201,168,76,.1)",borderRadius:6}},
"\u2713 Last run: "+autoResult.newLeads+" new leads, "+autoResult.newBuyers+" buyers added"+(autoResult.staged?", "+autoResult.staged+" leads staged":"")),
React.createElement("div",{style:{display:"flex",gap:".5rem",flexWrap:"wrap"}},
React.createElement("button",{className:"btn btn-dk",disabled:autoRunning||markets.length===0,onClick:function(){runAutoResearch(false)}},autoRunning?"\u23f3 Running…":"\u25b6 Run Now"),
markets.length===0&&React.createElement("span",{style:{fontSize:".75rem",color:"var(--mut)",alignSelf:"center"}},"Add markets above first")),
markets.length===0&&React.createElement("div",{style:{marginTop:".5rem",fontSize:".75rem",color:"var(--mut)"}},"Tip: Add at least one target market above to use automation.")
)),

// Tab 7: SCRIPTS LIBRARY (uses App-level scrOpen/scrSearch state)
tab===7&&React.createElement("div",{className:"pg"},
React.createElement("div",{className:"pg-t"},"\ud83d\udcdd Scripts Library"),
React.createElement("div",{className:"pg-s"},"Cold calls, texts, emails, voicemails, objection handlers."),
React.createElement("input",{className:"inp",placeholder:"Search\u2026",value:scrSearch,onChange:function(e){setScrSearch(e.target.value)},style:{maxWidth:340,marginBottom:"1.2rem"}}),
SLIB.map(function(cat,ci){
var fl=cat.items.filter(function(it){return!scrSearch||(it.n||it.q||"").toLowerCase().includes(scrSearch.toLowerCase())||(it.b||it.a||"").toLowerCase().includes(scrSearch.toLowerCase())});
if(!fl.length)return null;
return React.createElement("div",{className:"scat",key:ci},
React.createElement("div",{className:"scath",onClick:function(){setScrOpen(function(p){return Object.assign({},p,{[ci]:!p[ci]})})}},
React.createElement("div",null,
React.createElement("div",{className:"scat-t"},cat.cat),
React.createElement("div",{className:"scat-s"},cat.sub)
),
React.createElement("span",{style:{fontSize:".65rem",color:"var(--mut)",transition:"transform .25s",display:"inline-block",transform:scrOpen[ci]?"rotate(180deg)":"none"}},"\u25bc")
),
scrOpen[ci]&&React.createElement("div",{className:"scatb"},
cat.isObj
?fl.map(function(it,ii){return React.createElement("div",{className:"oc",key:ii},
React.createElement("div",{className:"oc-q"},'"',it.q,'"'),
React.createElement("div",{className:"oc-a"},it.a),
React.createElement("button",{className:"btn btn-ot btn-sm",style:{marginTop:".5rem"},onClick:function(){cpy(it.a)}},"Copy")
)})
:fl.map(function(it,ii){var tc={call:"stc",text:"stt",email:"ste",vm:"stv"}[it.t]||"stc";return React.createElement("div",{className:"si",key:ii},
React.createElement("div",{className:"si-h"},
React.createElement("div",{className:"si-n"},it.n," ",React.createElement("span",{className:"stg "+tc},it.t)),
React.createElement("button",{className:"btn btn-ot btn-xs",onClick:function(){cpy(it.b)}},"Copy")
),
React.createElement("div",{className:"sbox",style:{maxHeight:140,marginBottom:0}},it.b)
)})
)
)})
),

// Tab 8: SALES COACH
tab===8&&React.createElement("div",{className:"pg"},
React.createElement("div",{className:"pg-t"},"\ud83c\udfaf Sales Coach"),
React.createElement("div",{className:"pg-s"},"AI-powered roleplay exercises. Practice cold calls, texts, emails, and objection handling with a realistic AI seller. Get scored and coached after each session."),

coachExCount>0&&React.createElement("div",{style:{background:"var(--inp)",border:"1px solid var(--bdr)",borderRadius:"var(--r)",padding:".7rem 1rem",marginBottom:"1rem",display:"flex",alignItems:"center",gap:".6rem"}},
React.createElement("span",{style:{fontSize:"1.2rem"}},"\ud83c\udfc6"),
React.createElement("div",null,
React.createElement("div",{style:{fontFamily:"var(--sf)",fontWeight:700,fontSize:".9rem"}},coachExCount," Exercise",coachExCount!==1?"s":"","Completed"),
React.createElement("div",{style:{fontFamily:"var(--sm)",fontSize:".44rem",color:"var(--mut)",textTransform:"uppercase"}},"Keep practicing to sharpen your skills")
)
),

!coachMode?React.createElement("div",null,
React.createElement("div",{className:"coach-cards"},
COACH_EXERCISES.map(function(ex){return React.createElement("div",{className:"coach-card",key:ex.id,onClick:function(){setCoachMode(ex);setCoachChat([]);setCoachScore(null);setCoachInput("")}},
React.createElement("div",{className:"coach-card-h "+ex.bg},
React.createElement("span",{className:"coach-card-ico"},ex.ico),
React.createElement("div",null,React.createElement("div",{className:"coach-card-t"},ex.title),React.createElement("span",{className:"coach-diff "+ex.diff},ex.diff))
),
React.createElement("div",{className:"coach-card-bd"},
React.createElement("div",{className:"coach-card-desc"},ex.desc)
)
)}))
)
:React.createElement("div",null,
React.createElement("div",{style:{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"1rem"}},
React.createElement("div",null,
React.createElement("div",{style:{fontFamily:"var(--sf)",fontSize:"1.2rem",fontWeight:900}},coachMode.ico," ",coachMode.title),
React.createElement("div",{style:{fontFamily:"var(--sm)",fontSize:".46rem",color:"var(--mut)",textTransform:"uppercase",marginTop:".15rem"}},coachMode.type==="call"?"Phone Conversation":coachMode.type==="text"?"Text Messages":"Email Exchange"," \u00b7 ",React.createElement("span",{className:"coach-diff "+coachMode.diff},coachMode.diff))
),
React.createElement("button",{className:"btn btn-ot btn-sm",onClick:function(){setCoachMode(null);setCoachChat([]);setCoachScore(null)}},"\u2190 Back to Exercises")
),

React.createElement("div",{className:"coach-chat"},
coachChat.length===0&&React.createElement("div",{className:"coach-msg system"},"\ud83c\udfac Exercise started! You are the investor. ",coachMode.type==="call"?"The phone is ringing... what do you say when they pick up?":coachMode.type==="text"?"Send your first text message to the seller.":"Write your opening email to the seller."," Be natural and persuasive!"),
coachChat.map(function(m,i){return React.createElement("div",{className:"coach-msg "+(m.role==="user"?"user":"seller"),key:i},
React.createElement("div",{className:"coach-sender "+(m.role==="user"?"u":"s")},m.role==="user"?"\ud83d\udc64 You (Investor)":"\ud83c\udfe0 Seller"),
m.text
)}),
coachLoading&&React.createElement("div",{className:"coach-msg system"},"Seller is "+(coachMode.type==="text"?"typing":"thinking")+"...")
),

!coachScore&&React.createElement("div",{style:{display:"flex",gap:".4rem"}},
React.createElement("input",{className:"inp",placeholder:coachMode.type==="email"?"Write your email response...":coachMode.type==="text"?"Type your text message...":"What do you say?",value:coachInput,onChange:function(e){setCoachInput(e.target.value)},onKeyDown:function(e){if(e.key==="Enter"&&coachInput.trim()&&!coachLoading){coachSend(coachMode,coachInput.trim(),coachChat);setCoachInput("")}}}),
React.createElement("button",{className:"btn btn-gd",disabled:!coachInput.trim()||coachLoading,onClick:function(){if(coachInput.trim()){coachSend(coachMode,coachInput.trim(),coachChat);setCoachInput("")}}},"Send")
),

coachScore&&React.createElement("div",{className:"coach-score-card"},
React.createElement("div",{className:"coach-score-n"},coachScore.score,"/100"),
React.createElement("div",{className:"coach-score-l"},"Grade: ",coachScore.grade," \u2014 ",coachScore.summary),

React.createElement("div",{className:"coach-fb"},
React.createElement("div",{className:"coach-fb-t good"},"\u2705 What You Did Well"),
(coachScore.strengths||[]).map(function(s,i){return React.createElement("div",{key:i,style:{padding:".15rem 0"}},"\u2022 ",s)})
),

React.createElement("div",{className:"coach-fb"},
React.createElement("div",{className:"coach-fb-t improve"},"\ud83d\udee0\ufe0f Areas to Improve"),
(coachScore.improvements||[]).map(function(s,i){return React.createElement("div",{key:i,style:{padding:".15rem 0"}},"\u2022 ",s)})
),

React.createElement("div",{className:"coach-fb"},
React.createElement("div",{className:"coach-fb-t tip"},"\ud83d\udca1 Actionable Tips"),
(coachScore.tips||[]).map(function(s,i){return React.createElement("div",{key:i,style:{padding:".15rem 0"}},"\u2022 ",s)})
),

React.createElement("div",{style:{display:"flex",gap:".5rem",marginTop:"1rem"}},
React.createElement("button",{className:"btn btn-gd",onClick:function(){setCoachChat([]);setCoachScore(null);setCoachInput("")}},"\ud83d\udd04 Try Again"),
React.createElement("button",{className:"btn btn-ot",style:{color:"#f5f0e8",borderColor:"rgba(255,255,255,.2)"},onClick:function(){setCoachMode(null);setCoachChat([]);setCoachScore(null)}},"Choose Another Exercise")
)
)
)
),

// FAB
// QUICK ADD LEAD MODAL
qa&&(function(){
function qaSave(){
if(!qn.name||!qn.phone){toast("Name & phone required.");return}
var z2=zip||"",street2=qn.street||"",full2=street2?(street2+", "+(city||"")+", "+(state||"")+" "+z2).trim():"";
var arv2=parseFloat(qn.arv)||0,rep2=parseFloat(qn.repairs)||0;
var propD={yearBuilt:0,sqft:0,assessed:0,mortgageEst:0,equityEst:0,propType:"Unknown",lotSize:"",bedBath:""};
setLeads(function(prev){return[{id:"Q"+Date.now(),name:qn.name,type:qn.type,distressed:qn.type==="Distressed Seller",score:65,area:city||"Market",propertyAddress:full2,propertyStreet:street2,propertyCity:city||"",propertyState:state||"",propertyZip:z2,phone:qn.phone,altPhone:null,email:qn.email,contactPref:"Phone",budget:"",timeline:qn.timeline,tags:[],notes:qn.notes,userNotes:"",property:"Unknown",arv:arv2,repairCost:rep2,deal:calcD(arv2,rep2,fN),stage:"New Lead",distressTypes:[],violations:[],taxOwed:null,lastContacted:null,contactCount:0,dripDone:[],leadSource:qn.source,motivTags:[],propData:propD,activityLog:[{time:nowT(),date:td(),action:"Manually added via Quick Add"}],marketingCost:0}].concat(prev)});
setQa(false);setQn({name:"",phone:"",email:"",street:"",type:"Seller",timeline:"30\u201360 days",arv:"",repairs:"",notes:"",source:"Cold Call"});toast("Lead added!")}
return React.createElement("div",{className:"mbg",onClick:function(e){if(e.target===e.currentTarget){setQa(false);setQn({name:"",phone:"",email:"",street:"",type:"Seller",timeline:"30\u201360 days",arv:"",repairs:"",notes:"",source:"Cold Call"})}}},
React.createElement("div",{className:"modal",style:{maxWidth:540}},
React.createElement("div",{className:"mhd gl"},React.createElement("div",{className:"mhd-t"},"\u2795 Quick Add Lead"),React.createElement("button",{className:"mcl",onClick:function(){setQa(false)}},"\u2715")),
React.createElement("div",{className:"mbd"},
React.createElement("div",{className:"g2",style:{marginBottom:".7rem"}},
React.createElement("div",{className:"fg"},React.createElement("label",null,"Owner Name *"),React.createElement("input",{className:"inp",placeholder:"Full Name",value:qn.name,onChange:function(e){setQn(Object.assign({},qn,{name:e.target.value}))}})),
React.createElement("div",{className:"fg"},React.createElement("label",null,"Phone *"),React.createElement("input",{className:"inp",placeholder:"(555) 000-0000",value:qn.phone,onChange:function(e){setQn(Object.assign({},qn,{phone:e.target.value}))}}))
),
React.createElement("div",{className:"g2",style:{marginBottom:".7rem"}},
React.createElement("div",{className:"fg"},React.createElement("label",null,"Email"),React.createElement("input",{className:"inp",placeholder:"email@domain.com",value:qn.email,onChange:function(e){setQn(Object.assign({},qn,{email:e.target.value}))}})),
React.createElement("div",{className:"fg"},React.createElement("label",null,"Type"),React.createElement("select",{className:"sel",value:qn.type,onChange:function(e){setQn(Object.assign({},qn,{type:e.target.value}))}},React.createElement("option",null,"Seller"),React.createElement("option",null,"Distressed Seller"),React.createElement("option",null,"Buyer"),React.createElement("option",null,"Investor")))
),
React.createElement("div",{className:"g2",style:{marginBottom:".7rem"}},
React.createElement("div",{className:"fg"},React.createElement("label",null,"Street Address"),React.createElement("input",{className:"inp",placeholder:"123 Oak St",value:qn.street,onChange:function(e){setQn(Object.assign({},qn,{street:e.target.value}))}})),
React.createElement("div",{className:"fg"},React.createElement("label",null,"Lead Source"),React.createElement("select",{className:"sel",value:qn.source,onChange:function(e){setQn(Object.assign({},qn,{source:e.target.value}))}},LEAD_SOURCES.map(function(s){return React.createElement("option",{key:s},s)})))
),
React.createElement("div",{className:"g3",style:{marginBottom:".7rem"}},
React.createElement("div",{className:"fg"},React.createElement("label",null,"ARV ($)"),React.createElement("input",{className:"inp",type:"number",placeholder:"185000",value:qn.arv,onChange:function(e){setQn(Object.assign({},qn,{arv:e.target.value}))}})),
React.createElement("div",{className:"fg"},React.createElement("label",null,"Repairs ($)"),React.createElement("input",{className:"inp",type:"number",placeholder:"25000",value:qn.repairs,onChange:function(e){setQn(Object.assign({},qn,{repairs:e.target.value}))}})),
React.createElement("div",{className:"fg"},React.createElement("label",null,"Timeline"),React.createElement("select",{className:"sel",value:qn.timeline,onChange:function(e){setQn(Object.assign({},qn,{timeline:e.target.value}))}},React.createElement("option",null,"Immediate (0\u201330 days)"),React.createElement("option",null,"30\u201360 days"),React.createElement("option",null,"60\u201390 days"),React.createElement("option",null,"Flexible")))
),
React.createElement("div",{className:"fg",style:{marginBottom:"1rem"}},React.createElement("label",null,"Notes"),React.createElement("textarea",{className:"txa",rows:2,placeholder:"Motivation, situation\u2026",value:qn.notes,onChange:function(e){setQn(Object.assign({},qn,{notes:e.target.value}))}})),
React.createElement("div",{style:{display:"flex",gap:".5rem"}},
React.createElement("button",{className:"btn btn-gd",style:{flex:1},onClick:qaSave},"Save Lead"),
React.createElement("button",{className:"btn btn-ot",onClick:function(){setQa(false)}},"Cancel")
)
)
))})(),

React.createElement("button",{className:"fab",onClick:function(){setQa(true)},title:"Quick Add Lead"},"+"),

// SCRIPT MODAL
modal&&modal.t==="sc"&&(function(){var r=bScript(modal.l,loc,userName,userCompany,userPhone2);return React.createElement("div",{className:"mbg",onClick:function(e){if(e.target===e.currentTarget)setModal(null)}},React.createElement("div",{className:"modal w"},React.createElement("div",{className:"mhd"+(modal.l.distressed?" rs":"")},React.createElement("div",{className:"mhd-t"},"\ud83d\udcdd ",modal.l.name),React.createElement("button",{className:"mcl",onClick:function(){setModal(null)}},"\u2715")),React.createElement("div",{className:"mbd"},
React.createElement("div",{style:{background:"#fffbe8",border:"1px solid #e8d4a0",borderRadius:4,padding:".6rem .8rem",marginBottom:".8rem"}},
React.createElement("div",{className:"slbl",style:{color:"#8a6010"}},"\ud83d\udc64 Your Info (auto-fills into scripts)"),
React.createElement("div",{style:{display:"flex",gap:".4rem",flexWrap:"wrap"}},
React.createElement("input",{className:"inp",style:{flex:"1 1 120px",fontSize:".78rem",padding:".35rem .55rem"},placeholder:"Your Name",value:userName,onChange:function(e){setUserName(e.target.value)}}),
React.createElement("input",{className:"inp",style:{flex:"1 1 120px",fontSize:".78rem",padding:".35rem .55rem"},placeholder:"Company Name",value:userCompany,onChange:function(e){setUserCompany(e.target.value)}}),
React.createElement("input",{className:"inp",style:{flex:"1 1 120px",fontSize:".78rem",padding:".35rem .55rem"},placeholder:"Your Phone",value:userPhone2,onChange:function(e){setUserPhone2(e.target.value)}})
)
),
React.createElement("div",{className:"slbl"},"Script"),React.createElement("div",{className:"sbox"},r.sc),React.createElement("div",{style:{marginBottom:".9rem",display:"flex",gap:".45rem",flexWrap:"wrap"}},React.createElement("button",{className:"btn btn-dk btn-sm",onClick:function(){cpy(r.sc)}},"Copy"),modal.l.phone&&React.createElement("a",{href:"tel:"+modal.l.phone,className:"btn btn-bl btn-sm",style:{textDecoration:"none"},onClick:function(){logC(modal.l.id)}},"\ud83d\udcde Call"),React.createElement("button",{className:"btn btn-gn btn-sm",onClick:function(){dealBlast(modal.l)}},"\ud83d\udce2 Blast"),React.createElement("button",{className:"btn btn-sm",style:{background:"#2a1a4a",color:"#c0a0f0",border:"1px solid #5a3a8a"},onClick:function(){setModal({t:"ai",l:modal.l});setAiChat([]);setAiInput("")}},"\ud83e\udd16 AI Negotiator")),React.createElement("div",{className:"slbl"},"Follow-Up"),React.createElement("div",{className:"sbox",style:{maxHeight:90}},r.fu),React.createElement("div",{className:"slbl",style:{marginTop:".7rem"}},"Activity Log"),React.createElement("div",{className:"act-log"},(modal.l.activityLog||[]).slice(-5).reverse().map(function(a,i){return React.createElement("div",{className:"act-entry",key:i},React.createElement("span",{className:"act-time"},a.date," ",a.time),React.createElement("span",null,a.action))})))))})(),

// DRIP MODAL
modal&&modal.t==="dr"&&(function(){var steps=bDrip(modal.l,loc);return React.createElement("div",{className:"mbg",onClick:function(e){if(e.target===e.currentTarget)setModal(null)}},React.createElement("div",{className:"modal w"},React.createElement("div",{className:"mhd"+(modal.l.distressed?" rs":"")},React.createElement("div",{className:"mhd-t"},"\ud83d\udcc5 Drip \u2014 ",modal.l.name),React.createElement("button",{className:"mcl",onClick:function(){setModal(null)}},"\u2715")),React.createElement("div",{className:"mbd"},steps.map(function(s,si){return React.createElement("div",{key:si,style:{marginBottom:".8rem"}},React.createElement("div",{className:"slbl"},s.day," \u2014 ",s.type),React.createElement("div",{className:"sbox",style:{maxHeight:120}},s.msg),React.createElement("button",{className:"btn btn-ot btn-sm",onClick:function(){cpy(s.msg)}},"Copy"))}),React.createElement("button",{className:"btn btn-dk",onClick:function(){cpy(steps.map(function(s){return s.day+"\n"+s.msg}).join("\n\n\u2500\u2500\u2500\n\n"))}},"Copy All"))))})(),

// BUYER PITCH MODAL
modal&&modal.t==="bp"&&(function(){var b=modal.buyer,m=modal.matches;var pitch="Hi "+b.name+",\n\n"+m.length+" deal"+(m.length>1?"s":"")+" in "+(loc||"market")+":\n\n"+m.slice(0,3).map(function(l,i){return(i+1)+". "+l.propertyAddress+"\n   "+l.property+"\n   Offer: "+fmt(l.deal?.offer)+" | Fee: "+fmt(l.deal?.fee)+"\n   ARV: "+fmt(l.arv)+" | Repairs: "+fmt(l.repairCost)}).join("\n\n")+"\n\nCash close preferred.\n\n[Your Name] | [Phone]";return React.createElement("div",{className:"mbg",onClick:function(e){if(e.target===e.currentTarget)setModal(null)}},React.createElement("div",{className:"modal"},React.createElement("div",{className:"mhd bl"},React.createElement("div",{className:"mhd-t"},"\ud83d\udce8 ",b.name),React.createElement("button",{className:"mcl",onClick:function(){setModal(null)}},"\u2715")),React.createElement("div",{className:"mbd"},React.createElement("div",{className:"slbl"},m.length," deal",m.length!==1?"s":""),React.createElement("div",{className:"sbox"},pitch),React.createElement("div",{style:{display:"flex",gap:".45rem"}},React.createElement("button",{className:"btn btn-dk btn-sm",onClick:function(){cpy(pitch)}},"Copy"),b.email&&React.createElement("a",{href:"mailto:"+b.email+"?subject=Wholesale Deals&body="+encodeURIComponent(pitch),className:"btn btn-bl btn-sm",style:{textDecoration:"none"}},"Email")))))})(),

// DEAL ANALYZER MODAL with REHAB ESTIMATOR
modal&&modal.t==="de"&&(function(){var l=modal.l,res=daRes;return React.createElement("div",{className:"mbg",onClick:function(e){if(e.target===e.currentTarget)setModal(null)}},React.createElement("div",{className:"modal w"},React.createElement("div",{className:"mhd gn"},React.createElement("div",{className:"mhd-t"},"\ud83e\uddee Deal Analyzer \u2014 ",l.name),React.createElement("button",{className:"mcl",onClick:function(){setModal(null)}},"\u2715")),React.createElement("div",{className:"mbd"},l.propertyAddress&&React.createElement("div",{style:{background:"#f0f4ff",border:"1px solid #c0cce8",borderRadius:4,padding:".5rem .7rem",marginBottom:".9rem",fontSize:".8rem"}},React.createElement("div",{className:"slbl",style:{color:"#3a4a8a"}},"\ud83d\udccd Property"),React.createElement("strong",null,l.propertyAddress),l.propData&&React.createElement("div",{style:{fontSize:".72rem",color:"var(--mut)",marginTop:".2rem"}},l.propData.propType," | ",l.propData.bedBath," | ",l.propData.sqft,"sf | Built ",l.propData.yearBuilt)),
// 70% Calculator
React.createElement("div",{style:{background:"#f0faf0",border:"1px solid #a8d4a0",borderRadius:"var(--r)",padding:"1rem",marginBottom:"1rem"}},React.createElement("div",{className:"slbl",style:{color:"#2a6a20",marginBottom:".65rem"}},"70% Rule Calculator"),React.createElement("div",{className:"g3",style:{marginBottom:".7rem"}},React.createElement("div",{className:"fg"},React.createElement("label",null,"ARV"),React.createElement("input",{className:"inp",placeholder:String(l.arv),value:daA,onChange:function(e){setDaA(e.target.value)}})),React.createElement("div",{className:"fg"},React.createElement("label",null,"Repairs"),React.createElement("input",{className:"inp",placeholder:String(l.repairCost),value:daR,onChange:function(e){setDaR(e.target.value)}})),React.createElement("div",{className:"fg"},React.createElement("label",null,"Fee"),React.createElement("input",{className:"inp",placeholder:ft,value:daF2,onChange:function(e){setDaF(e.target.value)}}))),React.createElement("button",{className:"btn btn-gn",style:{width:"100%"},onClick:function(){setDaRes(calcD(daA||l.arv,daR||rehabTotal||l.repairCost,daF2||ft))}},"Calculate"),(res||l.deal)&&(function(){var d=res||l.deal;return d.mao>0?React.createElement("div",{style:{marginTop:".8rem",background:"#fff",border:"1.5px solid #4a9a3e",borderRadius:4,padding:".8rem 1rem"}},React.createElement("div",{style:{display:"grid",gridTemplateColumns:"repeat(3,1fr)",textAlign:"center",gap:".5rem"}},[["Offer",fmt(d.offer),"var(--gold)"],["Fee",fmt(d.fee),"var(--gold)"],["Equity",fmt(d.equity),"var(--green)"],["MAO",fmt(d.mao),"var(--fg)"],["ARV",fmt(d.arv),"var(--fg)"],["Profit",fmt(d.profit),"var(--green)"]].map(function(r){return React.createElement("div",{key:r[0]},React.createElement("div",{style:{fontFamily:"var(--sf)",fontSize:"1rem",fontWeight:900,color:r[2],lineHeight:1,marginBottom:".12rem"}},r[1]),React.createElement("div",{style:{fontFamily:"var(--sm)",fontSize:".42rem",color:"var(--mut)",textTransform:"uppercase"}},r[0]))}))):null})()),
// REHAB ESTIMATOR (NEW per blueprint)
React.createElement("div",{style:{background:"#fff8ee",border:"1px solid #e8c4a0",borderRadius:"var(--r)",padding:"1rem",marginBottom:"1rem"}},React.createElement("div",{className:"slbl",style:{color:"#a06020",marginBottom:".6rem"}},"\ud83d\udee0\ufe0f Rehab Cost Estimator \u2014 Total: ",React.createElement("strong",null,fmt(rehabTotal))),REHAB_CATS.map(function(c){return React.createElement("div",{className:"rehab-row",key:c.k},React.createElement("span",{style:{width:20,textAlign:"center"}},c.i),React.createElement("span",{className:"rehab-lbl"},c.l),React.createElement("input",{className:"rehab-slider",type:"range",min:0,max:c.max,step:500,value:rehab[c.k],onChange:function(e){setRehab(function(p){var n={};for(var key in p)n[key]=p[key];n[c.k]=parseInt(e.target.value);return n})}}),React.createElement("span",{className:"rehab-val"},fmt(rehab[c.k])))}),React.createElement("button",{className:"btn btn-rs btn-sm",style:{marginTop:".5rem"},onClick:function(){setDaR(String(rehabTotal))}},"Use as Repair Cost")),
// Deal sheet button
React.createElement("div",{style:{display:"flex",gap:".5rem"}},React.createElement("button",{className:"btn btn-dk btn-sm",onClick:function(){cpy(genDealSheet(l,loc));toast("Deal sheet copied!")}},"\ud83d\udcc4 Copy Deal Sheet"),React.createElement("button",{className:"btn btn-gn btn-sm",onClick:function(){dealBlast(l)}},"\ud83d\udce2 Blast to Buyers"))
)))})(),

// AI NEGOTIATION MODAL

// AI NEGOTIATION ASSISTANT MODAL
modal&&modal.t==="ai"&&(function(){var l=modal.l;return React.createElement("div",{className:"mbg",onClick:function(e){if(e.target===e.currentTarget)setModal(null)}},React.createElement("div",{className:"modal w"},React.createElement("div",{className:"mhd",style:{background:"#2a1a4a"}},React.createElement("div",{className:"mhd-t"},"\ud83e\udd16 AI Negotiation Assistant \u2014 ",l.name),React.createElement("button",{className:"mcl",onClick:function(){setModal(null);setAiChat([]);setAiInput("")}},"\u2715")),React.createElement("div",{className:"mbd"},
React.createElement("div",{style:{background:"#f5f0ff",border:"1px solid #c8b8e8",borderRadius:4,padding:".6rem .8rem",marginBottom:".8rem",fontSize:".78rem",lineHeight:1.55}},
React.createElement("strong",null,"How to use:")," Type what the seller said (or paste a conversation snippet) and the AI will analyze their motivation and suggest your best response strategies.",
React.createElement("div",{style:{marginTop:".3rem",fontFamily:"var(--sm)",fontSize:".44rem",color:"#5a3a8a",textTransform:"uppercase"}},"Property: ",l.propertyAddress," | ARV: ",fmt(l.arv)," | MAO: ",fmt(l.deal?.mao)," | Timeline: ",l.timeline)
),
React.createElement("div",{className:"ai-chat",style:{minHeight:150,maxHeight:350,overflowY:"auto",marginBottom:".6rem"}},
aiChat.length===0&&React.createElement("div",{className:"ai-msg sys"},"Paste what the seller said and I'll suggest your best response..."),
aiChat.map(function(m,i){return React.createElement("div",{className:"ai-msg "+(m.role==="user"?"user":"ai"),key:i},m.role==="ai"?React.createElement("div",null,React.createElement("div",{style:{fontFamily:"var(--sm)",fontSize:".42rem",color:m.role==="ai"?"#2a6a20":"#1a3a6a",textTransform:"uppercase",marginBottom:".3rem"}},m.role==="ai"?"\ud83e\udd16 AI Suggestions":"You"),React.createElement("div",{style:{whiteSpace:"pre-wrap"}},m.text)):React.createElement("div",null,React.createElement("div",{style:{fontFamily:"var(--sm)",fontSize:".42rem",color:"#1a3a6a",textTransform:"uppercase",marginBottom:".2rem"}},"Seller said:"),m.text))}),
aiLoading&&React.createElement("div",{className:"ai-loading"},React.createElement("div",{className:"ai-dot"}),React.createElement("div",{className:"ai-dot"}),React.createElement("div",{className:"ai-dot"}),React.createElement("span",null,"Analyzing seller motivation..."))
),
React.createElement("div",{className:"ai-input-row"},
React.createElement("input",{className:"inp",placeholder:'Paste what the seller said... e.g. "I just want to get out from under the mortgage"',value:aiInput,onChange:function(e){setAiInput(e.target.value)},onKeyDown:function(e){if(e.key==="Enter"&&aiInput.trim()&&!aiLoading){aiNegotiate(l,aiInput.trim());setAiInput("")}}}),
React.createElement("button",{className:"btn btn-gd",disabled:!aiInput.trim()||aiLoading,onClick:function(){if(aiInput.trim()){aiNegotiate(l,aiInput.trim());setAiInput("")}}},"\u2192")
),
React.createElement("div",{style:{marginTop:".6rem",display:"flex",gap:".3rem",flexWrap:"wrap"}},
React.createElement("span",{style:{fontFamily:"var(--sm)",fontSize:".44rem",color:"var(--mut)",textTransform:"uppercase",marginRight:".3rem"}},"Quick:"),
["I just want to get out from under the mortgage","I'm not sure I want to sell yet","Your offer is too low","I need to talk to my spouse first","How fast can you close?"].map(function(q){return React.createElement("button",{key:q,className:"btn btn-ot btn-xs",onClick:function(){setAiInput(q)}},q.slice(0,25)+"...")})
)
)))})(),

// KANBAN MODAL
modal&&modal.t==="kan"&&(function(){var l=modal.l,stage=gs(l.id);return React.createElement("div",{className:"mbg",onClick:function(e){if(e.target===e.currentTarget)setModal(null)}},React.createElement("div",{className:"modal"},React.createElement("div",{className:"mhd"+(l.distressed?" rs":"")},React.createElement("div",{className:"mhd-t"},l.name),React.createElement("button",{className:"mcl",onClick:function(){setModal(null)}},"\u2715")),React.createElement("div",{className:"mbd"},l.propertyAddress&&React.createElement("div",{style:{background:"#f0f4ff",border:"1px solid #c0cce8",borderRadius:4,padding:".5rem .75rem",marginBottom:".9rem",fontSize:".8rem"}},React.createElement("strong",null,l.propertyAddress)),React.createElement("div",{className:"slbl"},"Stage"),React.createElement("div",{style:{display:"flex",gap:".35rem",flexWrap:"wrap",marginBottom:"1rem"}},STAGES.map(function(s){return React.createElement("button",{key:s,className:"btn btn-xs"+(s===stage?" btn-gd":" btn-ot"),onClick:function(){ss(l.id,s);setModal(null)}},s)})),React.createElement("hr",{className:"divider"}),React.createElement("div",{className:"g2"},[["Score",aScore(l,stage)+" ("+heatLabel(aScore(l,stage))+")"],["Source",l.leadSource||"N/A"],["\ud83d\udcf1",l.phone],["\u2709\ufe0f",l.email],["\ud83c\udfe1",l.property],["\u23f1",l.timeline],["\ud83d\udcbc",fmt(l.deal?.fee)+" fee"]].map(function(r){return React.createElement("div",{key:r[1],style:{fontSize:".8rem",display:"flex",gap:".4rem"}},React.createElement("span",null,r[0]),React.createElement("span",null,r[1]))})),React.createElement("div",{style:{marginTop:".9rem",display:"flex",gap:".45rem",flexWrap:"wrap"}},React.createElement("button",{className:"btn btn-dk btn-sm",onClick:function(){setModal({t:"sc",l:l})}},"\ud83d\udcdd Script"),l.phone&&React.createElement("a",{href:"tel:"+l.phone,className:"btn btn-gn btn-sm",style:{textDecoration:"none"},onClick:function(){logC(l.id)}},"\ud83d\udcde Call"),React.createElement("button",{className:"btn btn-bl btn-sm",onClick:function(){dealBlast(l)}},"\ud83d\udce2 Blast")))))})(),

// ── LEGAL MODAL ──────────────────────────────────────────────────
legalOpen&&React.createElement("div",{className:"mbg",onClick:function(e){if(e.target===e.currentTarget){setLegalOpen(false);setLegalStateDetail(null)}}},
React.createElement("div",{className:"modal",style:{maxWidth:640,maxHeight:"85vh",overflowY:"auto"}},
React.createElement("div",{className:"mhd"},
React.createElement("div",{className:"mhd-t"},"\u2696\ufe0f Wholesale Real Estate \u2014 Legal Reference"),
React.createElement("button",{className:"mcl",onClick:function(){setLegalOpen(false);setLegalStateDetail(null)}},"\u2715")),
React.createElement("div",{className:"mbd"},
React.createElement("div",{style:{background:"rgba(201,168,76,.1)",border:"1px solid rgba(201,168,76,.3)",borderRadius:8,padding:"1rem",marginBottom:"1.2rem",fontSize:".78rem",lineHeight:1.7}},
React.createElement("div",{style:{fontWeight:700,marginBottom:".4rem",color:"var(--gold)"}},"⚠️ Important Legal Disclaimer"),
"LeadForge PRO provides this information for general educational purposes only. It does NOT constitute legal advice. Wholesale real estate laws change frequently and vary by state, county, and municipality. ",
React.createElement("strong",null,"You are solely responsible for ensuring your activities comply with all applicable laws."),
" Always consult a licensed real estate attorney in the relevant state before conducting any wholesale transaction."),
legalStateDetail&&STATE_LEGAL[legalStateDetail]&&React.createElement("div",{style:{marginBottom:"1.2rem"}},
React.createElement("div",{style:{display:"flex",alignItems:"center",gap:".6rem",marginBottom:".7rem"}},
React.createElement("span",{style:{fontSize:"1.4rem"}},(STATE_LEGAL[legalStateDetail].level==="danger"?"\ud83d\udd34":STATE_LEGAL[legalStateDetail].level==="warn"?"\ud83d\udfe1":"\ud83d\udfe2")),
React.createElement("div",null,
React.createElement("div",{style:{fontWeight:700,fontSize:"1rem"}},(US_STATES.find(function(s){return s.c===legalStateDetail})||{n:legalStateDetail}).n),
React.createElement("div",{style:{fontSize:".78rem",color:STATE_LEGAL[legalStateDetail].level==="danger"?"#ff8080":STATE_LEGAL[legalStateDetail].level==="warn"?"var(--gold)":"#80e080"}},STATE_LEGAL[legalStateDetail].summary))),
React.createElement("div",{style:{background:"rgba(255,255,255,.04)",border:"1px solid rgba(255,255,255,.08)",borderRadius:6,padding:"1rem",fontSize:".8rem",lineHeight:1.85,marginBottom:".7rem"}},STATE_LEGAL[legalStateDetail].detail),
React.createElement("div",{style:{background:STATE_LEGAL[legalStateDetail].level==="danger"?"rgba(220,50,50,.1)":"rgba(255,255,255,.04)",border:"1px solid "+(STATE_LEGAL[legalStateDetail].level==="danger"?"rgba(220,50,50,.3)":"rgba(255,255,255,.1)"),borderRadius:6,padding:".7rem 1rem",fontSize:".8rem",lineHeight:1.65}},
React.createElement("strong",null,"\u2705 Recommended Action: "),STATE_LEGAL[legalStateDetail].action),
React.createElement("button",{className:"btn btn-dk btn-sm",style:{marginTop:".8rem"},onClick:function(){setLegalStateDetail(null)}},"\u2190 All States")),
!legalStateDetail&&React.createElement("div",null,
React.createElement("div",{style:{fontFamily:"var(--sm)",fontSize:".5rem",letterSpacing:".16em",color:"var(--mut)",textTransform:"uppercase",marginBottom:".8rem"}},"All 50 States \u2014 Click any state for details"),
React.createElement("div",{style:{display:"flex",flexWrap:"wrap",gap:".3rem",marginBottom:"1rem"}},
US_STATES.map(function(s){var info=STATE_LEGAL[s.c];var col=!info||info.level==="ok"?"rgba(80,200,80,.12)":info.level==="warn"?"rgba(220,160,50,.15)":"rgba(220,50,50,.15)";var border=!info||info.level==="ok"?"rgba(80,200,80,.25)":info.level==="warn"?"rgba(220,160,50,.3)":"rgba(220,50,50,.3)";return React.createElement("button",{key:s.c,onClick:function(){setLegalStateDetail(s.c)},style:{padding:".25rem .5rem",background:col,border:"1px solid "+border,borderRadius:4,cursor:"pointer",fontSize:".72rem",color:"var(--fg)",transition:"opacity .15s"},title:(info?info.summary:"Generally Permitted")},(info&&info.level==="danger"?"\ud83d\udd34":info&&info.level==="warn"?"\ud83d\udfe1":"\ud83d\udfe2")+" "+s.c)})),
React.createElement("div",{style:{display:"flex",gap:"1.2rem",fontSize:".72rem",color:"var(--mut)",marginBottom:".6rem",flexWrap:"wrap"}},
React.createElement("span",null,"\ud83d\udd34 License Required \u2014 3 states (IL, OK, SC)"),
React.createElement("span",null,"\ud83d\udfe1 Caution / Regulated \u2014 9 states"),
React.createElement("span",null,"\ud83d\udfe2 Generally Permitted \u2014 38 states")),
React.createElement("div",{style:{fontSize:".73rem",color:"var(--mut)",lineHeight:1.7,padding:".6rem",background:"rgba(255,255,255,.03)",borderRadius:6}},"Click any state for detailed information, recommended actions, and market notes. Laws change — always verify current requirements with a local real estate attorney before transacting."))
)))

);}
