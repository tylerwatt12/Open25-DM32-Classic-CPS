/* SPDX-License-Identifier: MIT */
#include <stdio.h>
#include <string.h>
#include <stdlib.h>
#include "board.h"
#include "codeplug/codeplug.h"
#include "p25/p25_codeplug.h"
#include "debuglink/debuglink.c"
const board_t board={.name="DM-32UV",.power_count=9};
uint32_t hal_millis(void){return 0;}
static void hex(const uint8_t *p){for(unsigned i=0;i<56;i++)printf("%02x",p[i]);}
int main(void){
 char action;unsigned rx,tx,tg,id,only,mode,bw;char encoded[113];
 while(scanf(" %c",&action)==1){
  if(action=='F'){
   uint8_t response[DL_REPLY_MAX];
   size_t n=cmd_version(response,sizeof response);
   if(n<1||response[0]!=DL_ST_OK)return 3;
   if(fwrite(response+1,1,n-1,stdout)!=n-1)return 3;
   continue;
  }
  uint8_t bytes[56];channel_t c={0},back; int input_ok=-1;
  if(action=='V'){
   unsigned own,mode_id,radio_id;
   if(scanf("%u%u%u%u%u",&tg,&own,&mode_id,&radio_id,&only)!=5)return 2;
   uint8_t mode_bytes[4]={(uint8_t)mode_id,(uint8_t)(mode_id>>8),(uint8_t)(mode_id>>16),(uint8_t)(mode_id>>24)};
   c.mode=RADIO_MODE_P25;c.bw=RADIO_BW_12K5;c.p25_nac=0x293;c.p25_tg=(uint16_t)tg;
   c.p25_id=own?own:p25_unit_id_decode(mode_bytes,4,radio_id);c.rx_only=only!=0;
   printf("{\"id\":%u,\"valid\":%d}\n",c.p25_id,codeplug_p25_valid(&c));continue;
  }
  if(action=='P'){
   if(scanf("%u%u%u%u%u",&rx,&tx,&tg,&id,&only)!=5)return 2;
   c.mode=RADIO_MODE_P25;c.bw=RADIO_BW_12K5;c.p25_nac=rx;c.p25_tx_nac_override=tx;c.p25_tg=tg;c.p25_id=id;c.rx_only=only!=0;
   uint8_t params[9];codeplug_p25_params_encode(&c,params);
   printf("{\"hex\":\"");for(unsigned i=0;i<9;i++)printf("%02x",params[i]);puts("\"}");continue;
  }
  if(action=='E'){
   if(scanf("%u%u%u%u%u%u%u",&rx,&tx,&tg,&id,&only,&mode,&bw)!=7)return 2;
   strcpy(c.name,"P25 fixture");c.rx_hz=446050000;c.tx_hz=446050000;c.mode=(uint8_t)mode;
   c.bw=bw?RADIO_BW_25K:RADIO_BW_12K5;c.power=CODEPLUG_POWER_DEFAULT;
   c.p25_nac=(uint16_t)rx;c.p25_tx_nac_override=(uint16_t)tx;c.p25_tg=(uint16_t)tg;c.p25_id=id;c.rx_only=only!=0;
   input_ok=codeplug_p25_valid(&c);
   memset(bytes,0xFF,sizeof bytes);codeplug_openfw_encode(&c,bytes);
  }else if(action=='D'){
   if(scanf("%112s",encoded)!=1||strlen(encoded)!=112)return 2;
   for(unsigned i=0;i<56;i++){unsigned n;if(sscanf(encoded+2*i,"%2x",&n)!=1)return 2;bytes[i]=(uint8_t)n;}
  }else return 2;
  int valid=codeplug_openfw_decode(bytes,&back);
  printf("{\"hex\":\"");hex(bytes);printf("\",\"ok\":%d,\"input_ok\":%d",valid,input_ok);
  if(valid)printf(",\"mode\":%u,\"rx\":%u,\"tx\":%u,\"tg\":%u,\"id\":%u,\"rxOnly\":%d",back.mode,back.p25_nac,back.p25_tx_nac_override,back.p25_tg,back.p25_id,back.rx_only);
  puts("}");
 }
 return 0;
}
