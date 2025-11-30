#!/bin/bash

# Script para extrair texturas de todos os mods do Minecraft
# As texturas ficam em: assets/[modid]/textures/item/

MODS_DIR="/home/ubuntu/atm-10-pias/mods"
OUTPUT_DIR="/home/ubuntu/site-pias/html/textures"
TEMP_DIR="/tmp/mc-textures-extract"

echo "=== Extrator de Texturas do Minecraft ==="
echo "Mods: $MODS_DIR"
echo "Output: $OUTPUT_DIR"
echo ""

# Limpar diretórios
rm -rf "$TEMP_DIR"
rm -rf "$OUTPUT_DIR"/*
mkdir -p "$TEMP_DIR"
mkdir -p "$OUTPUT_DIR"

# Contador
total_textures=0

# Extrair texturas de cada JAR
for jar in "$MODS_DIR"/*.jar; do
    if [ -f "$jar" ]; then
        jarname=$(basename "$jar")
        echo "Processando: $jarname"
        
        # Extrair apenas as texturas de item e block para temp
        unzip -q -o "$jar" "assets/*/textures/item/*" "assets/*/textures/block/*" -d "$TEMP_DIR" 2>/dev/null
    fi
done

# Também extrair texturas do Minecraft vanilla (se existir o server.jar ou libraries)
echo ""
echo "Procurando texturas vanilla..."

# Tentar encontrar o JAR do cliente/servidor com texturas vanilla
MINECRAFT_JAR=$(find /home/ubuntu/atm-10-pias/libraries -name "*.jar" -path "*minecraft*" 2>/dev/null | head -1)
if [ -n "$MINECRAFT_JAR" ]; then
    echo "Extraindo de: $MINECRAFT_JAR"
    unzip -q -o "$MINECRAFT_JAR" "assets/minecraft/textures/item/*" "assets/minecraft/textures/block/*" -d "$TEMP_DIR" 2>/dev/null
fi

# Organizar as texturas na estrutura: modid/itemname.png
echo ""
echo "Organizando texturas..."

find "$TEMP_DIR/assets" -type f -name "*.png" 2>/dev/null | while read texture; do
    # Extrair modid e nome do arquivo do path
    # Path: assets/modid/textures/item/itemname.png
    relative_path="${texture#$TEMP_DIR/assets/}"
    modid=$(echo "$relative_path" | cut -d'/' -f1)
    filename=$(basename "$texture")
    
    # Criar pasta do mod se não existir
    mkdir -p "$OUTPUT_DIR/$modid"
    
    # Copiar textura
    cp "$texture" "$OUTPUT_DIR/$modid/$filename"
    ((total_textures++))
done

# Contar texturas
total_textures=$(find "$OUTPUT_DIR" -name "*.png" | wc -l)

# Limpar temp
rm -rf "$TEMP_DIR"

echo ""
echo "=== Extração Completa ==="
echo "Total de texturas extraídas: $total_textures"
echo "Localização: $OUTPUT_DIR"
echo ""
echo "Estrutura: $OUTPUT_DIR/[modid]/[itemname].png"
echo "Exemplo: $OUTPUT_DIR/minecraft/diamond.png"

# Listar alguns exemplos
echo ""
echo "Exemplos de texturas extraídas:"
find "$OUTPUT_DIR" -name "*.png" | head -10
