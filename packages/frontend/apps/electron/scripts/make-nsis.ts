import path from 'node:path';

import { buildForge } from 'app-builder-lib';
import debug from 'debug';
import fs from 'fs-extra';

import {
  appIdMap,
  arch,
  buildType,
  iconPngPath,
  icoPath,
  platform,
  productName,
  REPO_ROOT,
  ROOT,
} from './make-env.js';

const log = debug('affine:make-nsis');

async function make() {
  let tmpPath: string | undefined;

  try {
    const appName = productName;
    const makeDir = path.resolve(ROOT, 'out', buildType, 'make');
    const outPath = path.resolve(makeDir, `nsis.windows/${arch}`);
    const appDirectory = path.resolve(
      ROOT,
      'out',
      buildType,
      `${appName}-${platform}-${arch}`
    );

    await fs.ensureDir(outPath);
    await fs.emptyDir(outPath);

    // Create a temporary directory for app-builder-lib.
    tmpPath = await fs.mkdtemp(appName);

    log(`Copying app to ${tmpPath}`);
    await fs.copy(appDirectory, tmpPath);

    log(`Calling app-builder-lib's buildForge() with ${tmpPath}`);
    const output = await buildForge(
      { dir: tmpPath },
      {
        win: [`nsis:${arch}`],
        // @ts-expect-error - upstream type is wrong
        publish: null, // buildForge will incorrectly publish the build
        config: {
          appId: appIdMap[buildType],
          productName,
          executableName: productName,
          icon: iconPngPath,
          extraMetadata: {
            // do not use package.json's name
            name: productName,
          },
          nsis: {
            differentialPackage: false,
            perMachine: false,
            oneClick: false,
            license: path.resolve(REPO_ROOT, 'LICENSE'),
            include: path.resolve(ROOT, 'scripts', 'nsis-installer.nsh'),
            installerIcon: icoPath,
            allowToChangeInstallationDirectory: true,
            installerSidebar: path.resolve(
              ROOT,
              'resources',
              'icons',
              'nsis-sidebar.bmp'
            ),
          },
        },
      }
    );

    if (output.length === 0) {
      throw new Error(
        'NSIS packaging completed without producing an installer.'
      );
    }

    log('making nsis.windows done:', output);
    for (const file of output) {
      const filePath = path.resolve(outPath, path.basename(file));
      await fs.move(file, filePath);
    }
  } finally {
    // Clean up even when copying or packaging fails.
    if (tmpPath) {
      await fs.remove(tmpPath);
    }
  }
}

make().catch(error => {
  console.error('Windows NSIS packaging failed:', error);
  process.exitCode = 1;
});
