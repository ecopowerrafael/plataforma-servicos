import {describe,expect,it} from 'vitest';

import {mapWapiConnectionResponse,mapWapiTransportError} from './whatsapp-connection.js';

const response=(status:number,body:unknown)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json'}});
describe('W-API connection diagnostics',()=>{
  it('recognizes a connected instance',async()=>{ expect(await mapWapiConnectionResponse(response(200,{connected:true}))).toMatchObject({connected:true,code:'WHATSAPP_CONNECTED'}); });
  it('maps invalid tokens',async()=>{ expect(await mapWapiConnectionResponse(response(401,{code:'UNAUTHORIZED'}))).toMatchObject({code:'WHATSAPP_INVALID_TOKEN',httpStatus:401,externalCode:'UNAUTHORIZED'}); });
  it('maps missing instances',async()=>{ expect(await mapWapiConnectionResponse(response(404,{message:'not found'}))).toMatchObject({code:'WHATSAPP_INSTANCE_NOT_FOUND'}); });
  it('maps disconnected instances',async()=>{ expect(await mapWapiConnectionResponse(response(200,{connected:false}))).toMatchObject({code:'WHATSAPP_DISCONNECTED'}); });
  it('maps external service failures',async()=>{ expect(await mapWapiConnectionResponse(response(503,{message:'offline'}))).toMatchObject({code:'WHATSAPP_EXTERNAL_UNAVAILABLE'}); });
  it('preserves a safe external code from a valid error body',async()=>{ expect(await mapWapiConnectionResponse(response(422,{code:'PLAN_ROUTE_DISABLED',message:'route unavailable'}))).toMatchObject({code:'WHATSAPP_ROUTE_UNAVAILABLE',externalCode:'PLAN_ROUTE_DISABLED'}); });
  it('handles unexpected bodies',async()=>{ expect(await mapWapiConnectionResponse(new Response('not-json',{status:200}))).toMatchObject({code:'WHATSAPP_UNEXPECTED_RESPONSE'}); });
  it('maps timeouts',()=>{ expect(mapWapiTransportError(new DOMException('timeout','TimeoutError'))).toMatchObject({code:'WHATSAPP_TIMEOUT'}); });
  it('redacts token-like values from external messages',async()=>{const token='a'.repeat(80);const result=await mapWapiConnectionResponse(response(422,{message:`Bearer ${token}`}));expect(result.message).not.toContain(token);expect(JSON.stringify(result)).not.toContain(token);});
});
