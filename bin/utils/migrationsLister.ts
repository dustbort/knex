import color from 'colorette';

import { success } from './cli-config-utils';

export function listMigrations(completed, newMigrations) {
  let message = '';

  if (completed.length === 0) {
    message += color.red('No Completed Migration files Found. \n');
  } else {
    message = color.green(
      `Found ${completed.length} Completed Migration file/files.\n`
    );

    for (let i = 0; i < completed.length; i++) {
      const file = completed[i];
      message += color.cyan(`${file} \n`);
    }
  }

  if (newMigrations.length === 0) {
    message += color.red('No Pending Migration files Found.\n');
  } else {
    message += color.green(
      `Found ${newMigrations.length} Pending Migration file/files.\n`
    );

    for (let i = 0; i < newMigrations.length; i++) {
      const file = newMigrations[i];
      message += color.cyan(`${file.file} \n`);
    }
  }

  success(message);
}
