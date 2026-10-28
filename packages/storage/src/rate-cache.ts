import type Database from 'better-sqlite3';
import {rateSnapshotSchema} from '../../contracts/src/rate-conversion.ts';
import type {RateSnapshot} from '../../contracts/src/rate-conversion.ts';
import {StorageError} from './errors.ts';
/** Called inside the existing single owner's transaction, never a second writer. */
export function rateConfigurationRevision(db:Database.Database):{revision:number;enabled:boolean}{
 const row=db.prepare("SELECT revision,value FROM settings WHERE id='calculator.rateSource'").get() as {revision:number;value:string}|undefined;
 return {revision:row?.revision??0,enabled:row?JSON.parse(row.value)==='frankfurter':false};
}
export function getCachedRate(db:Database.Database,pair:{base:string;quote:string}):RateSnapshot|null{
 const row=db.prepare('SELECT base,quote,rate,as_of_date,fetched_at FROM currency_rate_cache WHERE base=? AND quote=?').get(pair.base,pair.quote) as {base:string;quote:string;rate:number;as_of_date:string;fetched_at:string}|undefined;
 return row?rateSnapshotSchema.parse({provider:'frankfurter',base:row.base,quote:row.quote,rate:row.rate,asOfDate:row.as_of_date,fetchedAt:row.fetched_at}):null;
}
export function putCachedRate(db:Database.Database,snapshot:RateSnapshot,configurationRevision:number):RateSnapshot{
 const config=rateConfigurationRevision(db);if(config.revision!==configurationRevision||!config.enabled)throw new StorageError('conflict');
 const value=rateSnapshotSchema.parse(snapshot);
 db.prepare('INSERT INTO currency_rate_cache(base,quote,rate,as_of_date,fetched_at) VALUES(?,?,?,?,?) ON CONFLICT(base,quote) DO UPDATE SET rate=excluded.rate,as_of_date=excluded.as_of_date,fetched_at=excluded.fetched_at').run(value.base,value.quote,value.rate,value.asOfDate,value.fetchedAt);
 db.prepare('DELETE FROM currency_rate_cache WHERE (base,quote) NOT IN (SELECT base,quote FROM currency_rate_cache ORDER BY fetched_at DESC,base,quote LIMIT 64)').run();
 return value;
}
export function clearCachedRates(db:Database.Database,configurationRevision:number){
 if(rateConfigurationRevision(db).revision!==configurationRevision)throw new StorageError('conflict');
 db.prepare('DELETE FROM currency_rate_cache').run();return {outcome:'cleared' as const};
}
