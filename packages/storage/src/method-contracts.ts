import { workflowEditorRecordSchema, workflowEditorWriteSchema } from '../../contracts/src/workflow-editor.ts';
import { dataControlContracts } from '@linuxcast/platform-contracts/data-controls';
import { secretReferenceContracts } from '@linuxcast/platform-contracts/secrets';
import { fileIndexContracts } from '@linuxcast/file-index/contracts';
import * as z from 'zod';
import { quicklinkRepositoryContracts } from '../../contracts/src/quicklinks.ts';
import { permissionRepositoryContracts } from '@linuxcast/platform-contracts/permissions';
import { conversationRecordSchema, messageRevisionRecordSchema, createAiRepositoryContracts, uiTextSchema, commandAliasSchema } from '../../contracts/src/index.ts';
import type { RepositoryContracts } from '../../contracts/src/index.ts';
import { launcherCommandIdSchema, isLauncherVisibilityProtected } from '../../contracts/src/launcher.ts';
const settingId = z.enum(['ui.theme', 'launcher.shortcut', 'onboarding.completed', 'clipboard.historyEnabled']);
const revision = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER - 1);
const commandId = z.string().regex(/^[a-z][a-z0-9._:-]{0,199}$/u);
const settingValue = z.union([z.string(), z.boolean()]);
const validSetting = (v: {id:string;value:string|boolean}) => {
  switch(v.id) {
    case 'ui.theme': return typeof v.value === 'string' && ['system','dark','light'].includes(v.value);
    case 'launcher.shortcut': return typeof v.value === 'string' && v.value.length <= 100 &&
      ![...v.value].some(c => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127);
    default: return typeof v.value === 'boolean';
  }
};
const setting = z.strictObject({id:settingId,revision:revision.min(1),value:settingValue,modifiedAt:z.iso.datetime()}).refine(validSetting);
const usage = z.strictObject({commandId,useCount:revision,lastUsedAt:z.iso.datetime().nullable(),pinned:z.boolean(),alias:uiTextSchema.nullable()});
const visibilityId = launcherCommandIdSchema.refine(id => !isLauncherVisibilityProtected(id));
const visibility = z.strictObject({commandId:visibilityId,hidden:z.boolean()});
export const hiddenCommandIdsSchema = z.array(visibilityId).max(4102).refine(ids =>
  ids.every((id,index) => index === 0 || ids[index - 1]! < id));
/** Complete method schemas owned by storage. No database connection is imported. */
export const storageContracts: RepositoryContracts = new Map([
  ...quicklinkRepositoryContracts,
  ['workflows.editor.get',{params:z.strictObject({}),result:workflowEditorRecordSchema.nullable()}],
  ['workflows.editor.write',{params:workflowEditorWriteSchema,result:workflowEditorRecordSchema}],
  ...createAiRepositoryContracts(),
  ...permissionRepositoryContracts,
  ...fileIndexContracts,
  ...secretReferenceContracts,
  ...dataControlContracts,
  ['settings.get',{params:z.strictObject({id:settingId}),result:setting.nullable()}],
  ['settings.set',{params:z.strictObject({id:settingId,expectedRevision:revision,value:settingValue}).refine(validSetting),result:setting}],
  ['commands.setPinned',{params:z.strictObject({commandId,pinned:z.boolean()}),result:usage}],
  ['commands.setAlias',{params:z.strictObject({commandId,alias:commandAliasSchema.nullable()}),result:usage}],
  ['commands.recordUse',{params:z.strictObject({commandId}),result:usage}],
  ['commands.getUsage',{params:z.strictObject({commandId}),result:usage.nullable()}],
  ['commands.listHidden',{params:z.strictObject({}),result:hiddenCommandIdsSchema}],
  ['commands.setHidden',{params:visibility,result:visibility}],
  ['ai.conversations.put',{params:z.strictObject({record:conversationRecordSchema,expectedRevision:revision}),result:conversationRecordSchema}],
  ['ai.messages.list',{params:z.strictObject({conversationId:z.uuid(),afterId:z.uuid().optional(),limit:z.number().int().min(1).max(100)}),result:z.array(messageRevisionRecordSchema).max(100)}],
]);
