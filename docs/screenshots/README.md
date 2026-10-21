# Skrinshotlar — oldin / keyin (3-qism: dizayn tizimi)

`before/` — dizayn tizimi yangilanishidan oldin, `after/` — keyin. Bir xil nomli fayllarni yonma-yon solishtiring.

| Ekran | Fayl |
|---|---|
| Panel: kirish (kompyuter / telefon) | `panel-login.png`, `panel-login-phone.png` |
| Panel: imtihonlar ro'yxati (kompyuter / telefon) | `panel-exams.png`, `panel-exams-phone.png` |
| Panel: yangi imtihon | `panel-new-exam.png` |
| Panel: imtihon tahriri + Figma holati | `panel-edit-figma.png` |
| Panel: jonli kuzatuv (kompyuter / telefon) | `panel-live.png`, `panel-live-phone.png` |
| Panel: natijalar, topshirilgan ishlar | `panel-results.png`, `panel-submissions.png` |
| Panel: sozlamalar, "topilmadi" holati | `panel-settings.png`, `panel-notfound.png` |
| Desktop: kirish, qoidalar, kutish xonasi | `desktop-login.png`, `desktop-rules.png`, `desktop-lobby.png` |
| Desktop: ish maydoni (terminal, bloklangan buyruq) | `desktop-workspace.png` |
| Desktop: Figma "Dizayn ko'rish" (faqat `after/`) | `desktop-design-inspect.png` |

Asosiy o'zgarishlar:
- **Panel:** yagona token to'plami `packages/shared/design/tokens.css` (rang, tipografiya, oraliq, radius, soya, fokus halqasi); panel CSS'da qattiq yozilgan hex ranglar qolmadi. Yorug' yon menyu (Linear uslubi), SVG ikonkalar (emoji o'rniga), telefon kengligida gorizontal toshish tuzatildi, statistikalar 2 ustun, tahrirlab bo'lmaydigan imtihonda aniq ogohlantirish va "Saqlash" nofaol.
- **Desktop:** VS Code Dark Modern tokenlari (`--bg #1f1f1f`, yon panel/terminal `#181818`, tugma `#0078d4`, input `#313131`, menyu `#1f1f1f`/`#454545`) — har biri `workbench.colorCustomizations` nomi bilan izohlangan; Activity Bar ko'k faol chiziq, tab yuqori ko'k chizig'i, codicon uslubidagi SVG ikonkalar, kod maydoni plasholderi to'g'rilandi, bir xil `focusBorder` halqasi.

Qayta olish: panel — `apps/desktop/node_modules/.bin/electron scripts/panel-screenshots.cjs after`; desktop — `apps/desktop/scripts/cdp.mjs shot ...`.
