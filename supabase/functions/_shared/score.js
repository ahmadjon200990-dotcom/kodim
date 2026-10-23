// GENERATSIYA QILINGAN — supabase/scripts/build-shared.mjs. Qo'lda tahrirlamang.
// @ts-nocheck
function n(e){return e.reduce((t,r)=>t+r.points,0)}function u(e){return e.status==="ANNULLED"?0:Math.max(0,(e.teacherScore??e.aiScore??0)-n(e.penalties))}export{u as computeFinalScore,n as sumPenalties};
