import 'dotenv/config';
import { InstallGlobalCommands } from './utils.js';

const INGAMEBAN_COMMAND = {
  name: 'ingameban',
  description: 'Ban a player from the Roblox game',
  options: [
    {
      type: 4, // INTEGER
      name: 'userid',
      description: 'Roblox User ID of the player to ban',
      required: true,
    },
    {
      type: 3, // STRING
      name: 'duration',
      description: 'Ban duration (e.g. 30m, 2h, 7d, 1w, perm)',
      required: true,
    },
    {
      type: 3, // STRING
      name: 'reason',
      description: 'Reason for the ban',
      required: true,
    },
  ],
  type: 1,
  default_member_permissions: '8', // ADMINISTRATOR
  integration_types: [0],
  contexts: [0],
};

const INFO_COMMAND = {
  name: 'info',
  description: 'View a player\'s build data from a specific slot',
  options: [
    {
      type: 4, // INTEGER
      name: 'userid',
      description: 'Roblox User ID of the player',
      required: true,
    },
    {
      type: 4, // INTEGER
      name: 'slot',
      description: 'Slot number (1-7)',
      required: true,
      min_value: 1,
      max_value: 7,
    },
  ],
  type: 1,
  integration_types: [0],
  contexts: [0],
};

const SETMONEY_COMMAND = {
  name: 'setmoney',
  description: 'Set a player\'s in-game currency to a specific amount',
  options: [
    {
      type: 4, // INTEGER
      name: 'userid',
      description: 'Roblox User ID of the player',
      required: true,
    },
    {
      type: 4, // INTEGER
      name: 'amount',
      description: 'Amount to set currency to',
      required: true,
    },
  ],
  type: 1,
  default_member_permissions: '8', // ADMINISTRATOR
  integration_types: [0],
  contexts: [0],
};

const ADDMONEY_COMMAND = {
  name: 'addmoney',
  description: 'Add currency to a player\'s in-game balance',
  options: [
    {
      type: 4, // INTEGER
      name: 'userid',
      description: 'Roblox User ID of the player',
      required: true,
    },
    {
      type: 4, // INTEGER
      name: 'amount',
      description: 'Amount of currency to add',
      required: true,
    },
  ],
  type: 1,
  default_member_permissions: '8', // ADMINISTRATOR
  integration_types: [0],
  contexts: [0],
};

const ALL_COMMANDS = [INGAMEBAN_COMMAND, INFO_COMMAND, SETMONEY_COMMAND, ADDMONEY_COMMAND];

InstallGlobalCommands(process.env.APP_ID, ALL_COMMANDS);
