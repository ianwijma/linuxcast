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
it('carries a closed canonical unit separately from numeric text without accepting arbitrary labels',()=>{
  expect(calculatorCopyReplySchema.safeParse({ok:true,value:{outcome:'copied',text:'1000',unit:'m'}}).success).toBe(true);
  for(const unit of ['metres<script>','constructor','KB','gal','m;rm',null])expect(calculatorCopyReplySchema.safeParse({ok:true,value:{outcome:'copied',text:'1',unit}}).success).toBe(false);
  expect(calculatorCopyRequestSchema.safeParse({protocolVersion:1,revision:1,expression:'1 km to m',unit:'m'}).success).toBe(false);
});

it('accepts only bounded closed-format sRGB colour receipts and never mixed units or arbitrary CSS',()=>{
  for(const [colour,text] of [['hex','#ff0080'],['hex','#ff008080'],['rgb','rgb(255 0 128 / 0.5)'],['hsl','hsl(359.999999 100% 50% / 0)']])expect(calculatorCopyReplySchema.safeParse({ok:true,value:{outcome:'copied',colour,text}}).success).toBe(true);
  for(const [colour,text] of [['hex','#fff'],['hex','#FF0000'],['rgb','rgb(256 0 0)'],['rgb','rgb(0 0 0 / 1.1)'],['rgb','rgb(0, 0, 0)'],['hsl','hsl(360 100% 50%)'],['hsl','hsl(0 101% 50%)'],['rgb','rgb(255.0 0 0 / 1)'],['rgb','rgb(255 0 0 / 1)'],['hsl','hsl(30 0% 50%)'],['hsl','hsl(0 100% 0%)'],['hex','#ff0000ff'],['hex','url(private)'],['rgb','var(--private)']])expect(calculatorCopyReplySchema.safeParse({ok:true,value:{outcome:'copied',colour,text}}).success).toBe(false);
  expect(calculatorCopyReplySchema.safeParse({ok:true,value:{outcome:'copied',colour:'hex',text:'#ff0000',unit:'m'}}).success).toBe(false);
  expect(calculatorCopyRequestSchema.safeParse({protocolVersion:1,revision:1,expression:'#fff to rgb',colour:'rgb'}).success).toBe(false);
});
