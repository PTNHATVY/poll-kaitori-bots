import { Client, GatewayIntentBits, SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { chromium } from "playwright";
import fs from "fs";
import "dotenv/config";

/* ================= STORAGE ================= */
const DATA_FILE = "./items.json";

function loadItems() {
  if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, JSON.stringify({}, null, 2));
  return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
}
function saveItems(items) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(items, null, 2));
}

/* ================= CLIENT ================= */
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

/* ================= COMMANDS ================= */
const cmdKaitori = new SlashCommandBuilder()
  .setName("kaitori")
  .setDescription("🔎 Tra giá mua lại theo JAN hoặc tên/alias")
  .addStringOption(opt =>
    opt.setName("query").setDescription("📦 JAN hoặc tên (vd: F10, instax)").setRequired(true)
  );

const cmdList = new SlashCommandBuilder()
  .setName("kaitori_list")
  .setDescription("📋 Xem danh sách sản phẩm đang theo dõi");

const cmdAdd = new SlashCommandBuilder()
  .setName("kaitori_add")
  .setDescription("➕ Thêm sản phẩm (JAN + tên + link + ảnh tuỳ chọn)")
  .addStringOption(opt => opt.setName("code").setDescription("📦 JAN code").setRequired(true))
  .addStringOption(opt => opt.setName("name").setDescription("🏷️ Tên/alias").setRequired(true))
  .addStringOption(opt => opt.setName("url").setDescription("🔗 Link trang item").setRequired(true))
  .addStringOption(opt => opt.setName("image").setDescription("🖼️ Link ảnh sản phẩm (tuỳ chọn)").setRequired(false));

/* ================= SCRAPE ================= */
async function fetchKaitoriData(itemUrl) {
  const browser = await chromium.launch({
    headless: true // chạy có giao diện để tránh bị chặn; ổn định rồi có thể đổi true
  });

  const context = await browser.newContext({
    locale: "ja-JP",
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120"
  });

  const page = await context.newPage();

  try {
    await page.goto(itemUrl, { waitUntil: "networkidle", timeout: 60000 });

    // Đóng popup nếu có
    try { await page.click('button:has-text("同意")', { timeout: 3000 }); } catch {}
    try { await page.click('button:has-text("OK")', { timeout: 3000 }); } catch {}

    await page.waitForTimeout(3000);

    const result = await page.evaluate(() => {
      // ===== LẤY ẢNH =====
      let img =
        document.querySelector('meta[property="og:image"]')?.content ||
        document.querySelector('meta[name="twitter:image"]')?.content ||
        null;

      if (!img) {
        const selectors = [
          ".item-image img",
          ".product img",
          ".product-image img",
          ".main-image img",
          "#itemImage img",
          "img"
        ];
        for (const sel of selectors) {
          const el = document.querySelector(sel);
          if (el && el.src) {
            img = el.src;
            break;
          }
        }
      }

      // ===== LẤY GIÁ (FIX) =====
      let priceText = null;

      const priceSelectors = [
        ".price",
        ".kaitori-price",
        ".buy-price",
        ".purchase-price",
        ".item-price",
        "span.price",
        "div.price",
        "[class*='price']"
      ];

      for (const sel of priceSelectors) {
        const el = document.querySelector(sel);
        if (el && el.innerText) {
          const t = el.innerText.trim();
          if (t.match(/¥\s*\d[\d,]*/i) || t.match(/\d[\d,]*\s*円/i)) {
            priceText = t;
            break;
          }
        }
      }

      // Fallback: quét toàn trang
      if (!priceText) {
        const text = document.body.innerText;
        const m = text.match(/¥\s*\d[\d,]*/i) || text.match(/\d[\d,]*\s*円/i);
        priceText = m ? m[0].trim() : null;
      }

      return { price: priceText, image: img };
    });

    await browser.close();
    return result;
  } catch (err) {
    console.error("Scrape error:", err);
    await browser.close();
    return { price: null, image: null };
  }
}

/* ================= READY ================= */
client.once("ready", async () => {
  console.log(`✅ Bot online: ${client.user.tag}`);
  await client.application.commands.set([cmdKaitori, cmdList, cmdAdd]);
});

/* ================= INTERACTIONS ================= */
client.on("interactionCreate", async interaction => {
  if (!interaction.isChatInputCommand()) return;

  const items = loadItems();

  /* ===== /kaitori ===== */
  if (interaction.commandName === "kaitori") {
    const query = interaction.options.getString("query").toLowerCase();
    await interaction.deferReply();

    let foundCode = null;
    let foundItem = null;

    for (const [code, obj] of Object.entries(items)) {
      if (code.toLowerCase() === query || obj.name.toLowerCase().includes(query)) {
        foundCode = code;
        foundItem = obj;
        break;
      }
    }

    if (!foundItem) {
      const embed = new EmbedBuilder()
        .setTitle("❌ Không tìm thấy sản phẩm")
        .setDescription("Không khớp JAN hoặc tên/alias.\nDùng `/kaitori_list` để xem danh sách hoặc `/kaitori_add` để thêm.")
        .setColor(0xe74c3c);
      return interaction.editReply({ embeds: [embed] });
    }

    let finalImage = foundItem.image || null;

    const data = await fetchKaitoriData(foundItem.url);
    const price = data.price;

    if (!finalImage && data.image) finalImage = data.image;

    const embed = new EmbedBuilder()
      .setTitle("🔎 Kaitori Price Search")
      .setColor(price ? 0x2ecc71 : 0xe74c3c)
      .addFields(
        { name: "🏷️ Tên", value: foundItem.name },
        { name: "📦 JAN", value: `\`${foundCode}\`` },
        { name: "🔗 Link", value: foundItem.url },
        { name: "💰 Giá mua lại", value: price ? price : "⚠️ Không thấy giá / Shop không thu" }
      )
      .setTimestamp();

    if (finalImage) embed.setThumbnail(finalImage);

    return interaction.editReply({ embeds: [embed] });
  }

  /* ===== /kaitori_list (FIX KHÔNG VƯỢT 4096 KÝ TỰ) ===== */
  if (interaction.commandName === "kaitori_list") {
    const keys = Object.keys(items);

    let desc =
      keys.length === 0
        ? "📭 Chưa có sản phẩm nào.\nDùng `/kaitori_add` để thêm."
        : keys
            .map((k, i) => {
              const it = items[k];
              return `${i + 1}. **${it.name}**\nJAN: \`${k}\`\n${it.url}\nẢnh: ${it.image || "—"}`;
            })
            .join("\n\n");

    // CẮT NGẮN để không vượt giới hạn Discord (4096)
    if (desc.length > 3500) {
      desc = desc.slice(0, 3500) + "\n\n⚠️ Danh sách quá dài, đã bị cắt bớt...";
    }

    const embed = new EmbedBuilder()
      .setTitle("📋 Danh sách sản phẩm đang theo dõi")
      .setDescription(desc)
      .setColor(0x3498db);

    return interaction.reply({ embeds: [embed], ephemeral: true });
  }

  /* ===== /kaitori_add ===== */
  if (interaction.commandName === "kaitori_add") {
    const code = interaction.options.getString("code");
    const name = interaction.options.getString("name");
    const url = interaction.options.getString("url");
    const image = interaction.options.getString("image");

    items[code] = { name, url, image: image || null };
    saveItems(items);

    const embed = new EmbedBuilder()
      .setTitle("✅ Đã thêm sản phẩm")
      .setColor(0x2ecc71)
      .addFields(
        { name: "🏷️ Tên", value: name },
        { name: "📦 JAN", value: `\`${code}\`` },
        { name: "🔗 Link", value: url },
        { name: "🖼️ Ảnh", value: image || "—" }
      )
      .setFooter({ text: "Đã lưu vào items.json" });

    return interaction.reply({ embeds: [embed], ephemeral: true });
  }
});

/* ================= LOGIN ================= */
client.login(process.env.KAITORI_TOKEN);

