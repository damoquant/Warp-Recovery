import { getContractAddress, getDateString, getLogger } from '../lib/util';
import { runMethodSafe } from '../lib/util/runner';
import * as fs from 'fs';
import { infuraKey } from '../config';
import { ethers } from 'ethers';
import { AccountScores } from '../lib/logic/scoreAccounts';
import { WarpControlService } from '../lib/contracts';
import { calculateTeamScores, TeamScore } from '../lib/logic/scoreTeams';
import { getTeams } from '../lib/logic/teamHelpers';
import { outputFile } from './output';

const logger = getLogger('scripts::scoreTeams');

export const scoreTeams = async (accountScores: AccountScores) => {
  const context = {
    provider: new ethers.providers.InfuraProvider('homestead', infuraKey),
    networkId: 1,
  };
  const { provider, networkId } = context;

  logger.log(`Scoring teams`);

  const control = new WarpControlService(getContractAddress(networkId, 'warpControl'), provider, null);

  const normalizedAccountScores: AccountScores = {};
  for (const [account, score] of Object.entries(accountScores)) {
    if (score.weightedScore < 0.01) {
      logger.log(`Skipping ${account} with less than 0.01 TVL`);
      continue;
    }
    const normalizedAccount = account.toLowerCase();
    if (!normalizedAccountScores[normalizedAccount]) {
      normalizedAccountScores[normalizedAccount] = score;
    } else {
      logger.log(`There was a duplicate account for ${normalizedAccount}`);
    }
  }


  const teams = await getTeams(control, true);
  const teamScoresMap = calculateTeamScores(normalizedAccountScores, teams);

  const teamScoresList = Object.values(teamScoresMap).sort((a: TeamScore, b: TeamScore) => {
    return b.weightedScore - a.weightedScore;
  });

  const scoredTeams = {
    teams: teamScoresList,
    timestamp: new Date()
  }

  const toWriteContents = JSON.stringify(scoredTeams);
  outputFile('teamScores', toWriteContents);
};


const runScoreTeams = async () => {
  if (process.argv.length < 3) {
    logger.error(`a 'filepath' parameter is required. Pass in the name of the data json file in the cli`);
    return;
  }
  const filePath = process.argv[2];

  console.log(`Loading data from ${filePath}`);

  let fileContents: Maybe<string> = null;

  try {
    fileContents = fs.readFileSync(filePath).toString();
  } catch (e) {
    console.error(`Failed to load ${filePath}\n${e}`);
    return;
  }

  const accountScores = JSON.parse(fileContents) as AccountScores;

  await scoreTeams(accountScores);
}

if (require.main === module) {
  runMethodSafe(runScoreTeams);
}
