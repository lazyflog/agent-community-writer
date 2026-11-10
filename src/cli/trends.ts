import { loadConfig } from "../config";
import { collectTrends } from "../trends";

const main = async () => {
  const config = loadConfig();
  console.log(`📰 트렌드 수집 시작 — ${config.name}`);

  const trends = await collectTrends(config);

  console.log(`\n✅ context/trends.json 저장 (${trends.date})`);
  for (const c of trends.categories) console.log(`   • ${c.label}: ${c.items.join(" / ")}`);
};

main().catch((e) => {
  console.error(`\n❌ 트렌드 수집 실패: ${(e as Error).message}`);
  process.exit(1);
});
