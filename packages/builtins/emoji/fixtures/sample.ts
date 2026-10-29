import {canonicalEmojiId} from '@linuxcast/contracts';
import type {EmojiRow} from '@linuxcast/contracts';
/** Synthetic public subset for component tests only. Production loads all3944
 * pinned licensed records exclusively through the trusted main API. */
export const groups=['Smileys & Emotion','People & Body','Component','Animals & Nature','Food & Drink','Travel & Places','Activities','Objects','Symbols','Flags'].filter(group=>group!=='Component').map(id=>({id,name:id,count:20}));
export const rows:EmojiRow[]=[
 ['😀','grinning face','Smileys & Emotion','face-smiling','1.0'],['🥰','smiling face with hearts','Smileys & Emotion','face-affection','11.0'],['👩🏽‍💻','woman technologist: medium skin tone','People & Body','person-role','4.0'],['🐈','cat','Animals & Nature','animal-mammal','0.7'],['🍎','red apple','Food & Drink','food-fruit','0.6'],['🚀','rocket','Travel & Places','transport-air','0.6'],['⚽','soccer ball','Activities','sport','0.6'],['💡','light bulb','Objects','light-video','0.6'],['❤️','red heart','Symbols','heart','0.6'],['🇦🇺','flag: Australia','Flags','country-flag','2.0'],
].map(([value,name,group,subgroup,version])=>({id:canonicalEmojiId(value!),value:value!,name:name!,group:group!,subgroup:subgroup!,version:version!}));
