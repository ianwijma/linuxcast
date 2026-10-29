import corpus from '../data/emoji-17.0.json' with {type:'json'};

/** Fixed offline releases, not a claim about the newest Unicode release. */
export const EMOJI_UNICODE_VERSION='17.0';
export const EMOJI_CLDR_VERSION='48';

export interface Emoji {
 readonly id:string;
 /** Fully-qualified Unicode copy value. Never normalize or rebuild this value. */
 readonly value:string;
 readonly name:string;
 readonly group:string;
 readonly subgroup:string;
 /** Emoji introduction version from the pinned emoji-test.txt E field. */
 readonly version:string;
 readonly keywords:readonly string[];
 /** Alternate CLDR English short name when different from the Unicode name. */
 readonly aliases:readonly string[];
}
export interface EmojiGroup {
 readonly id:string;
 readonly name:string;
 readonly count:number;
}

/** Callers cannot change canonical copy values, keywords or subsequent results. */
export const emojiData:readonly Emoji[]=Object.freeze(corpus.emoji.map(entry=>Object.freeze({
 ...entry,keywords:Object.freeze([...entry.keywords]),aliases:Object.freeze([...entry.aliases]),
})));
const byId=new Map(emojiData.map(entry=>[entry.id,entry]));
const counts=new Map<string,number>();
for(const entry of emojiData)counts.set(entry.group,(counts.get(entry.group)??0)+1);
export const emojiGroups:readonly EmojiGroup[]=Object.freeze([...counts].map(([name,count])=>Object.freeze({id:name,name,count})));
export function getEmojiGroups():readonly EmojiGroup[]{return emojiGroups;}

/** Fixed safe error; never include a query or native diagnostic in a failure. */
export class EmojiInputError extends Error {
 readonly code='invalid-request';
 constructor(){super('Use a valid emoji search, category and result limit.');this.name='EmojiInputError';}
}

/** Unknown canonical IDs return undefined; malformed IDs are invalid requests. */
export function getEmoji(id:string):Emoji|undefined {
 if(typeof id!=='string'||id.length>128||!/^emoji:[0-9a-f]{4,6}(?:-[0-9a-f]{4,6})*$/u.test(id))throw new EmojiInputError();
 return byId.get(id);
}
