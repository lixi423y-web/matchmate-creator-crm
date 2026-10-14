import {createHandler,runtimeEnv} from './handler.mjs';
Deno.serve(createHandler({env:(name:string)=>runtimeEnv((key:string)=>Deno.env.get(key),name)}));
