/* SPDX-License-Identifier: MIT */
/* Copyright (c) 2026 Open25-DM32 Contributors */
/* Real native firmware codeplug owners, on the upstream simulated flash. */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "codeplug/codeplug.h"
#include "codeplug/codeplug_tag.h"
#include "p25/p25_codeplug.h"
#include "nxdn/nxdn_codeplug.h"
#include "storage/storage.h"
#include "sim/sim_flash.h"
void storage_lock(void) {}
void storage_unlock(void) {}
bool radio_p25_fits(void) {return true;}
bool radio_nxdn_fits(void) {return true;}
static const hal_flash_map_t map={.settings_addr=0x11000,.settings_size=0x8000,.journal_addr=0x19000,
 .openfw_eeprom=0,.openfw_flash=0x20000,.openfw_end=0x200000,.calibration_addr=0x10000,.calibration_size=0x200};
static const band_t bands[]={{136000000,174000000,true},{400000000,480000000,true}};
const board_t board={.name="DM-32UV",.bands=bands,.band_count=2,.power_count=9,.flash=&sim_flash};
static int unhex(const char *s,uint8_t *out) {
 size_t n=strlen(s);if(n%2||n>128)return -1;
 for(size_t i=0;i<n/2;i++){unsigned v;if(sscanf(s+2*i,"%2x",&v)!=1)return -1;out[i]=(uint8_t)v;}return (int)(n/2);
}
int main(int argc,char **argv) {
 if(argc==2){
  sim_flash_create(0x200000,&map);
  FILE *f=fopen(argv[1],"rb");if(!f)return 2;
  size_t n=fread(sim_flash_data,1,0x200000,f);fclose(f);if(n<0xAEE60)return 2;
  if(!storage_init())return 3;codeplug_init();
  for(uint16_t i=1;i<=codeplug_channel_count();i++) {
   channel_t c;if(!codeplug_channel(i,&c))continue;
   if(c.kind==CODEPLUG_KIND_P25){p25_conv_cfg_t p={0};bool ok=p25_conv_load(i,&c,&p);
    printf("{\"number\":%u,\"kind\":2,\"ok\":%d,\"rx\":%u,\"tx\":%u,\"target\":%u,\"unit\":%d,\"id\":%u}\n",i,ok,p.conv.rx_nac,p.conv.tx_nac,p.target,p.target_unit,p.unit_id);
   } else if(c.kind==CODEPLUG_KIND_NXDN){nxdn_conv_cfg_t p={0};bool ok=nxdn_conv_load(i,&c,&p);
    printf("{\"number\":%u,\"kind\":4,\"ok\":%d,\"rx\":%u,\"tx\":%u,\"target\":%u,\"unit\":%d,\"id\":%u,\"rate9600\":%d}\n",i,ok,p.conv.rx_ran,p.conv.tx_ran,p.target,p.target_unit,p.unit_id,p.conv.rate9600);
   }
  }
  sim_flash_free();return 0;
 }
 char kind,raw[129];
 while(scanf(" %c %128s",&kind,raw)==2){uint8_t b[64];int n=unhex(raw,b);if(n<0)return 2;
  if(kind=='P'){p25_conv_t p;p25_conv_decode(b,n,&p);printf("{\"rx\":%u,\"tx\":%u,\"squelch\":%u}\n",p.rx_nac,p.tx_nac,p.squelch);}
  else if(kind=='N'){nxdn_conv_t p;nxdn_conv_decode(b,n,&p);printf("{\"rx\":%u,\"tx\":%u,\"squelch\":%u,\"rate9600\":%d}\n",p.rx_ran,p.tx_ran,p.squelch,p.rate9600);}
  else return 2;
 }
 return 0;
}
