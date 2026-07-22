import { loadLocalEnv } from "@/lib/env/load-local-env";
import { exportDocxToVault } from "@/lib/docx-export/convert-docx";
import { scanDocxFiles } from "@/lib/docx-export/scan-docx";
import { getConfig } from "@/lib/config";

loadLocalEnv();

async function main() {
  const config = getConfig();

  if (!config.vaultPath) {
    throw new Error("VAULT_PATH is not set in .env.local");
  }

  const docxPaths = await scanDocxFiles(config.vaultPath, config.docxInclude);
  console.log(`DOCX_INCLUDE=${config.docxInclude}`);
  console.log(`Found ${docxPaths.length} DOCX file(s)`);
  console.log(`Output: ${config.vaultPath}/${config.docxIndexDir}`);

  if (docxPaths.length === 0) {
    console.log("No DOCX files to export.");
    return;
  }

  const result = await exportDocxToVault({
    vaultPath: config.vaultPath,
    docxPaths,
    indexDir: config.docxIndexDir,
  });

  console.log(
    JSON.stringify(
      {
        exported: result.exported,
        skipped: result.skipped,
        warnings: result.warnings.length > 0 ? result.warnings : undefined,
      },
      null,
      2,
    ),
  );

  if (result.exported > 0) {
    console.log("\nNext: npm run index");
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
