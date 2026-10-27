import "server-only";

import { deflateRawSync, inflateRawSync } from "node:zlib";

const THEME_PATH="xl/theme/theme1.xml", MAX_ENTRIES=256, MAX_UNCOMPRESSED_BYTES=128*1024*1024;
type Entry={name:string;bytes:Uint8Array};

const crcTable=(()=>{const table=new Uint32Array(256);for(let value=0;value<256;value++){let current=value;for(let bit=0;bit<8;bit++)current=(current>>>1)^((current&1)?0xedb88320:0);table[value]=current>>>0;}return table;})();
const crc32=(bytes:Uint8Array)=>{let current=0xffffffff;for(const value of bytes)current=crcTable[(current^value)&255]^(current>>>8);return(current^0xffffffff)>>>0;};
const fail=():never=>{throw new Error("Unsupported Sales workbook OOXML package");};
const u16=(bytes:Uint8Array,offset:number)=>{if(offset<0||offset+2>bytes.length)fail();return bytes[offset]|bytes[offset+1]<<8;};
const u32=(bytes:Uint8Array,offset:number)=>{if(offset<0||offset+4>bytes.length)fail();return(bytes[offset]|bytes[offset+1]<<8|bytes[offset+2]<<16|bytes[offset+3]<<24)>>>0;};
const put16=(value:number)=>Uint8Array.from([value&255,value>>>8&255]);
const put32=(value:number)=>Uint8Array.from([value&255,value>>>8&255,value>>>16&255,value>>>24&255]);
const concat=(parts:Uint8Array[])=>{const length=parts.reduce((total,part)=>total+part.length,0),result=new Uint8Array(length);let offset=0;for(const part of parts){result.set(part,offset);offset+=part.length;}return result;};
const text=new TextDecoder("utf-8",{fatal:true}),ascii=new TextEncoder();

function endOfCentralDirectory(bytes:Uint8Array):number{for(let offset=bytes.length-22;offset>=Math.max(0,bytes.length-22-0xffff);offset--)if(u32(bytes,offset)===0x06054b50)return offset;return fail();}
function entries(bytes:Uint8Array):Entry[]{
 const end=endOfCentralDirectory(bytes);if(u16(bytes,end+4)||u16(bytes,end+6))fail();const count=u16(bytes,end+10),directorySize=u32(bytes,end+12),directoryOffset=u32(bytes,end+16);if(!count||count>MAX_ENTRIES||directoryOffset+directorySize>end)fail();
 const result:Entry[]=[];let offset=directoryOffset,total=0;
 for(let index=0;index<count;index++){
  if(u32(bytes,offset)!==0x02014b50)fail();const flags=u16(bytes,offset+8),method=u16(bytes,offset+10),compressedSize=u32(bytes,offset+20),uncompressedSize=u32(bytes,offset+24),nameSize=u16(bytes,offset+28),extraSize=u16(bytes,offset+30),commentSize=u16(bytes,offset+32),localOffset=u32(bytes,offset+42),name=text.decode(bytes.slice(offset+46,offset+46+nameSize));
  if(flags&1||method!==0&&method!==8||!name||name.includes("..")||result.some(entry=>entry.name===name)||localOffset+30>bytes.length||total+uncompressedSize>MAX_UNCOMPRESSED_BYTES)fail();
  if(u32(bytes,localOffset)!==0x04034b50)fail();const localNameSize=u16(bytes,localOffset+26),localExtraSize=u16(bytes,localOffset+28),dataOffset=localOffset+30+localNameSize+localExtraSize;if(dataOffset+compressedSize>bytes.length)fail();
  const compressed=bytes.slice(dataOffset,dataOffset+compressedSize),content=method===0?compressed:inflateRawSync(compressed,{maxOutputLength:uncompressedSize});if(content.length!==uncompressedSize)fail();total+=content.length;result.push({name,bytes:content});offset+=46+nameSize+extraSize+commentSize;
 }
 return result;
}
function zip(entries:Entry[]){
 const locals:Uint8Array[]=[],central:Uint8Array[]=[],seen=new Set<string>();let offset=0;
 for(const entry of entries){if(!entry.name||seen.has(entry.name)||entry.bytes.length>MAX_UNCOMPRESSED_BYTES)fail();seen.add(entry.name);const name=ascii.encode(entry.name),compressed=deflateRawSync(entry.bytes),checksum=crc32(entry.bytes),local=concat([put32(0x04034b50),put16(20),put16(0),put16(8),put16(0),put16(0),put32(checksum),put32(compressed.length),put32(entry.bytes.length),put16(name.length),put16(0),name,compressed]);locals.push(local);central.push(concat([put32(0x02014b50),put16(20),put16(20),put16(0),put16(8),put16(0),put16(0),put32(checksum),put32(compressed.length),put32(entry.bytes.length),put16(name.length),put16(0),put16(0),put16(0),put16(0),put32(0),put32(offset),name]));offset+=local.length;}
 const directory=concat(central),footer=concat([put32(0x06054b50),put16(0),put16(0),put16(entries.length),put16(entries.length),put32(directory.length),put32(offset),put16(0)]);return concat([...locals,directory,footer]);
}

/** Carries the source theme byte-for-byte through SheetJS, which otherwise UTF-8 re-encodes malformed legacy themes. */
export function restoreOriginalSalesWorkbookTheme(source:ArrayBuffer|Uint8Array,serialized:ArrayBuffer|Uint8Array):Uint8Array{
 const original=readOriginalSalesWorkbookTheme(source);
 const output=entries(serialized instanceof Uint8Array?serialized:new Uint8Array(serialized));const index=output.findIndex(entry=>entry.name===THEME_PATH);if(index<0)fail();output[index]={name:THEME_PATH,bytes:original};return zip(output);
}
export function readOriginalSalesWorkbookTheme(source:ArrayBuffer|Uint8Array):Uint8Array{const original=entries(source instanceof Uint8Array?source:new Uint8Array(source)).find(entry=>entry.name===THEME_PATH)?.bytes;if(!original)return fail();return original;}
