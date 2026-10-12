import "server-only";

export const SALES_ORDER_CORRECTION_TYPES=["sale_price","order_date","postage","card_fee","cogs","tracking","manual_non_shopify","exchange_partial_payment"] as const;
export type SalesOrderCorrectionType=typeof SALES_ORDER_CORRECTION_TYPES[number];
export type SalesOrderCorrection={orderNumber:string;type:SalesOrderCorrectionType;value:unknown;reason:string;mappedRowNumber?:number};
export const validateSalesOrderCorrection=(value:unknown):SalesOrderCorrection=>{
 const x=value as Partial<SalesOrderCorrection>;
 if(!x||typeof x.orderNumber!=="string"||!/^\d+$/.test(x.orderNumber)||!SALES_ORDER_CORRECTION_TYPES.includes(x.type as SalesOrderCorrectionType)||typeof x.reason!=="string"||!x.reason.trim())throw new Error("Invalid Sales order correction; order number, type, and reason are required");
 const type=x.type as SalesOrderCorrectionType;
 let corrected:unknown=x.value;
 if(["sale_price","postage","card_fee","cogs"].includes(type)){const amount=typeof x.value==="number"?x.value:typeof x.value==="string"?Number(x.value.trim()):NaN;if(!Number.isFinite(amount)||amount<0)throw new Error("Financial corrections require a non-negative numeric value");corrected=amount;}
 if(type==="order_date"){if(typeof x.value!=="string"||!/^\d{4}-\d{2}-\d{2}$/.test(x.value))throw new Error("Order-date corrections require an ISO date");corrected=x.value;}
 if(type==="tracking"){if(typeof x.value!=="string"||!x.value.trim())throw new Error("Tracking corrections require a reference");corrected=x.value.trim();}
 if(type==="manual_non_shopify"||type==="exchange_partial_payment"){if(x.value!==true)throw new Error("Treatment correction must be explicitly confirmed");corrected=true;}
 return {orderNumber:x.orderNumber,type,value:corrected,reason:x.reason.trim()};
};
// These are the managed Sales worksheet columns (zero based).  Treatment-only
// corrections deliberately have no cell mapping: they are durable audited
// evidence, rather than an invented value in the historical worksheet.
export const correctionColumn:Record<SalesOrderCorrectionType,number|undefined>={sale_price:1,order_date:10,postage:4,card_fee:5,cogs:3,tracking:8,manual_non_shopify:undefined,exchange_partial_payment:undefined};
export const readinessForCorrection=(type:SalesOrderCorrectionType,value:unknown)=>{
 if(type==="manual_non_shopify"||type==="exchange_partial_payment")return "REVIEW" as const;
 if(value===null||value===undefined||String(value).trim()==="")return "REVIEW" as const;
 return "READY" as const;
};
