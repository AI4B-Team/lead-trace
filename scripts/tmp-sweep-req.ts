#!/usr/bin/env bun
import { sweepRecordsRequestSurplusSources } from "../src/lib/surplus/records-request-intake.server";
console.log(JSON.stringify(await sweepRecordsRequestSurplusSources(), null, 2));
