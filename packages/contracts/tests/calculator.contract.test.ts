import { expect,it } from 'vitest';
import { calculatorCopyRequestSchema,calculatorCopyReplySchema,calculatorExpressionSchema } from '../src/calculator.ts';
it('bounds expressions and keeps copy requests free of renderer-supplied result text or dispatcher authority',()=>{
  const request={protocolVersion:1,revision:1,expression:'sqrt(9) + 2^3'};expect(calculatorCopyRequestSchema.safeParse(request).success).toBe(true);
  for(const value of [{...request,text:'arbitrary'},{...request,method:'writeText'},{...request,revision:0},{...request,expression:'2\n+2'},{...request,expression:'x'.repeat(513)}])expect(calculatorCopyRequestSchema.safeParse(value).success).toBe(false);
  expect(calculatorExpressionSchema.safeParse('é'.repeat(256)).success).toBe(true);expect(calculatorExpressionSchema.safeParse('é'.repeat(257)).success).toBe(false);
});
it('accepts only finite bounded numeric copied text and strict receipts',()=>{
  for(const text of ['0','-0.25','1e+30','1.23e-100'])expect(calculatorCopyReplySchema.safeParse({ok:true,value:{outcome:'copied',text}}).success).toBe(true);
  for(const text of ['NaN','Infinity','1e999','<script>','arbitrary','1 2','+4'])expect(calculatorCopyReplySchema.safeParse({ok:true,value:{outcome:'copied',text}}).success).toBe(false);
  expect(calculatorCopyReplySchema.safeParse({ok:true,value:{outcome:'copied',text:'4',expression:'private'}}).success).toBe(false);
});
