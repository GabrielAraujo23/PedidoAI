const L=h=>{const c=[1,3,5].map(i=>parseInt(h.slice(i,i+2),16)/255).map(v=>v<=.03928?v/12.92:((v+.055)/1.055)**2.4);return .2126*c[0]+.7152*c[1]+.0722*c[2]};
const R=(a,b)=>{const x=L(a),y=L(b);return ((Math.max(x,y)+.05)/(Math.min(x,y)+.05))};
const claro={background:"#F7F2EA",card:"#FFFFFF",muted:"#EFE9E1",foreground:"#1C1917","muted-foreground":"#57534E",primary:"#C2410C",destructive:"#B91C1C",success:"#047857",warning:"#92400E",border:"#D6CDBF"};
const escuro={background:"#17130F",card:"#221C17",muted:"#2C241E",foreground:"#F0E9E0","muted-foreground":"#B0A398",primary:"#E8935A",destructive:"#F87171",success:"#4ADE80",warning:"#FBBF24",border:"#453A31"};
const textos=["foreground","muted-foreground","primary","destructive","success","warning"];
const fundos=["background","card","muted"];
for(const [nome,t] of [["CLARO",claro],["ESCURO",escuro]]){
  console.log(`\n=== ${nome} ===`);
  for(const f of fundos) for(const x of textos){
    const r=R(t[x],t[f]);
    const ok=r>=4.5?"OK ":r>=3?"BAIXO":"FALHA";
    if(r<4.5) console.log(`  ${ok}  ${x.padEnd(17)} sobre ${f.padEnd(11)} ${r.toFixed(2)}:1`);
  }
  const rb=R(t.border,t.background);
  if(rb<1.5) console.log(`  FRACO borda sobre fundo: ${rb.toFixed(2)}:1 (recomendado >=1.5 para o cartao se destacar)`);
}
