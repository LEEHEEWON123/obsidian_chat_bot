import { loadLocalEnv } from "@/lib/env/load-local-env";
import { exportPdfsToVault } from "@/lib/pdf-export/convert-pdfs";
import { scanPdfFiles } from "@/lib/pdf-export/scan-pdfs";
import { getConfig } from "@/lib/config";

loadLocalEnv();

async function main() {
  const config = getConfig();

  if (!config.vaultPath) {
    throw new Error("VAULT_PATH is not set in .env.local");
  }

  const pdfPaths = await scanPdfFiles(config.vaultPath, config.pdfInclude);
  console.log(`PDF_INCLUDE=${config.pdfInclude}`);
  console.log(`Found ${pdfPaths.length} PDF file(s)`);
  console.log(`Output: ${config.vaultPath}/${config.pdfIndexDir}`);

  if (pdfPaths.length === 0) {
    console.log("No PDFs to export.");
    return;
  }

  const result = await exportPdfsToVault({
    vaultPath: config.vaultPath,
    pdfPaths,
    indexDir: config.pdfIndexDir,
    hybrid: config.pdfHybrid || undefined,
    hybridUrl: config.pdfHybridUrl || undefined,
    hybridMode: config.pdfHybrid || undefined ? config.pdfHybridMode : undefined,
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
