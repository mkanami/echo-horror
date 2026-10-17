// The hospital's material balance and prop vocabulary, using chapter-two maps.
// These aliases change textures, never the original props' authored proportions.
export const CAVE_PROP_KEYS={
  prop:'corroded',soft:'gauze',cloth:'canvas',paint:'enamel',pmetal2:'enamel',
  rust:'corroded',iron:'corroded',metal:'corroded',rubber:'cable',plastic:'porcelain',
  glass:'porcelain',paperw:'porcelain',bplastic:'cable',wood:'sediment',chip:'sediment',
  brick:'breccia',w_concrete:'limestone',conc2:'gravel',paper:'gauze',
};

export function hospitalFrame(frame){
  const options=o=>({...o,key:CAVE_PROP_KEYS[o?.key||'prop']||o?.key||'corroded',collide:false,walk:true});
  return {
    box:(x,y,z,w,h,d,o={})=>frame.box(x,y,z,w,h,d,options(o)),
    cyl:(x,y,z,rt,rb,h,segments,o={})=>frame.cyl(x,y,z,rt,rb,h,segments,options(o)),
    geo:(g,x,y,z,o={})=>frame.geo(g,x,y,z,options(o)),
  };
}

export function caveSurface(key){
  const cloth=['gauze','canvas'].includes(key),metal=['copper','corroded','enamel','mesh','cable'].includes(key);
  return {
    map:`cave/${key}`,scale:cloth?1.5:metal?.8:.45,
    bump:metal?1.2:1.1,boost:cloth?.6:1,
    wet:key==='wetrock'?.4:key==='algae'?.55:0,
    grime:cloth?.6:metal?.5:.65,
    tint:key==='gauze'?0xd8d4cc:key==='canvas'?0xc8c2b8:key==='enamel'?0xa7b5a7:0xffffff,
  };
}
