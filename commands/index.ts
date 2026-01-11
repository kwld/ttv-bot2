

import { load } from 'js-yaml';
import { Command } from '../types';
import { CMD_AI_YAML } from './ai/ai';
import { CMD_POINTS_YAML } from './economy/points';
import { CMD_DUEL_YAML } from './minigames/duel';
import { CMD_RAFFLE_YAML } from './minigames/raffle';
import { CMD_GAMBLE_YAML } from './minigames/gamble';
import { CMD_ADD_POINTS_YAML } from './economy/addpoints';
import { CMD_SET_POINTS_YAML } from './economy/setpoints';
import { CMD_GIVE_POINTS_YAML } from './economy/givepoints';
import { CMD_CANCEL_RAFFLE_YAML } from './minigames/cancelraffle';
import { CMD_TOP_YAML } from './economy/top';
import { CMD_CLIP_YAML } from './stream/clip';
import { CMD_WHOIS_YAML } from './utility/whois';
import { CMD_KOP_YAML } from './fun/kop';
import { CMD_LIST_YAML } from './utility/cmdlist';
import { CMD_VOTE_YAML } from './moderation/vote'; // New Import

export const BUILT_IN_COMMANDS: Command[] = [
    CMD_AI_YAML,
    CMD_POINTS_YAML,
    CMD_TOP_YAML,
    CMD_DUEL_YAML,
    CMD_RAFFLE_YAML,
    CMD_CANCEL_RAFFLE_YAML,
    CMD_GAMBLE_YAML,
    CMD_KOP_YAML,
    CMD_ADD_POINTS_YAML,
    CMD_SET_POINTS_YAML,
    CMD_GIVE_POINTS_YAML,
    CMD_CLIP_YAML,
    CMD_WHOIS_YAML,
    CMD_LIST_YAML,
    CMD_VOTE_YAML // Added
].map(yaml => load(yaml) as Command);