#!/bin/bash
# Downloads every P3 EOY/SA2 paper listed in eoy_pages.txt as pdfs/{year}-P3-Maths-EOY-{School}.pdf
P=$1  # work dir holding eoy_pages.txt (listing links) and pdfs/
while IFS=: read -r _ page; do
  y=$(echo "$page" | grep -oE 'download_[0-9]{4}' | cut -d_ -f2); s=$(echo "$page" | sed -E 's/.*_Maths_([A-Za-z0-9]+)_(EOY|SA2)_.*/\1/')
  out="$P/pdfs/$y-P3-Maths-EOY-$s.pdf"; [ -s "$out" ] && continue
  pdf=$(curl -s -m 30 "https://www.sgtestpaper.com/primary/$page" | grep -oiE 'href="[^"]+\.pdf"' | head -1 | cut -d'"' -f2)
  [ -z "$pdf" ] && { echo "NO PDF: $page"; continue; }
  curl -s -m 180 -o "$out" "$pdf" && echo "ok $y $s $(stat -c %s "$out")"; sleep 1
done < "$P/eoy_pages.txt"
