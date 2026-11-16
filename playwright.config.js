// SPDX-License-Identifier: MIT
import {defineConfig} from '@playwright/test';
export default defineConfig({testDir:'./browser',outputDir:'build/browser-results',workers:1,use:{baseURL:process.env.CPS_URL||'http://127.0.0.1:8340',channel:'chrome',headless:true,viewport:{width:1440,height:1000}},webServer:process.env.CPS_URL?undefined:{command:'python3 tools/serve.py',url:'http://127.0.0.1:8340',reuseExistingServer:true}});
