#!/bin/bash

# Build script for Quasar Landing Pages
# This script builds the completely self-contained Astro site

set -e

echo "🚀 Building Quasar Landing Pages with Astro..."

# Check if we're in the correct directory
if [ ! -f "astro.config.mjs" ]; then
    echo "❌ Error: astro.config.mjs not found. Please run this script from the landing directory."
    exit 1
fi

# Install dependencies if node_modules doesn't exist
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
fi

# Move assets to public directory structure (will be version controlled)
echo "📁 Setting up public directory structure..."

# Move from assets/ to public/assets/ if needed
if [ -d "assets/images" ] && [ ! -d "public/assets/images" ]; then
    echo "📂 Moving assets/ to public/assets/ for version control..."
    mkdir -p public
    mv assets public/
    echo "✅ Moved assets/ to public/assets/"
elif [ -d "public/assets/images" ]; then
    echo "✅ Found existing public/assets/images/"
else
    echo "❌ No images found in either location"
    exit 1
fi

# Show what we have
echo "   Images: $(ls -1 public/assets/images/ 2>/dev/null | wc -l) files"
echo "   Files: $(ls -1 public/assets/images/ 2>/dev/null | tr '\n' ' ')"

# Run Astro build
echo "🔨 Building Astro site..."
npm run build

# Check if build was successful
if [ $? -eq 0 ]; then
    echo "✅ Build completed successfully!"
    
    # Deploy all built files to parent public folder
    echo "📁 Deploying to ../public/..."
    
    # Copy homepage
    if [ -f "dist/index.html" ]; then
        cp dist/index.html ../public/
        echo "✅ Updated index.html"
    fi
    
    # Copy other pages maintaining .html extension
    if [ -f "dist/about/index.html" ]; then
        cp dist/about/index.html ../public/about.html
        echo "✅ Updated about.html"
    fi
    
    if [ -f "dist/faq/index.html" ]; then
        cp dist/faq/index.html ../public/faq.html
        echo "✅ Updated faq.html"
    fi
    
    if [ -f "dist/legal/index.html" ]; then
        cp dist/legal/index.html ../public/legal.html
        echo "✅ Updated legal.html"
    fi
    
    if [ -f "dist/author/index.html" ]; then
        cp dist/author/index.html ../public/author.html
        echo "✅ Updated author.html"
    fi
    
    # Copy 404 page
    if [ -f "dist/404.html" ]; then
        cp dist/404.html ../public/404.html
        echo "✅ Updated 404.html"
    fi
    
    # Copy all Astro-generated assets (CSS, JS, images)
    if [ -d "dist/_astro" ]; then
        rm -rf ../public/_astro 2>/dev/null || true
        cp -r dist/_astro ../public/
        echo "✅ Updated Astro CSS and JS assets"
    fi
    
    # Copy all built assets normally - Astro should have processed everything correctly
    echo "📁 Deploying to ../public/..."
    
    # Copy all Astro-generated assets 
    if [ -d "dist/assets" ]; then
        rm -rf ../public/assets 2>/dev/null || true
        cp -r dist/assets ../public/
        echo "✅ Deployed Astro-processed assets"
        echo "   Files in dist/assets/: $(find dist/assets/ -type f 2>/dev/null | wc -l) total files"
    fi
    
    # Also copy any standalone files from the landing public directory
    # This ensures favicon.ico and other root-level files are included
    if [ -d "public" ]; then
        # Copy individual files to avoid overwriting the assets directory
        for file in public/*.ico public/*.png public/*.jpg public/*.svg public/*.webmanifest public/*.txt public/*.xml; do
            if [ -f "$file" ]; then
                cp "$file" ../public/ 2>/dev/null || true
                echo "✅ Copied $(basename "$file")"
            fi
        done
    fi
    
    # Copy any JS files that might be in a separate js directory
    if [ -d "dist/js" ]; then
        rm -rf ../public/js 2>/dev/null || true
        cp -r dist/js ../public/
        echo "✅ Updated JS directory"
    fi
    
    # Copy sitemap files
    if [ -f "dist/sitemap-index.xml" ]; then
        cp dist/sitemap-index.xml ../public/
        echo "✅ Updated sitemap-index.xml"
    fi
    
    if [ -f "dist/sitemap-0.xml" ]; then
        cp dist/sitemap-0.xml ../public/
        echo "✅ Updated sitemap-0.xml"
    fi
    
    # Copy any other XML files
    for file in dist/*.xml; do
        if [ -f "$file" ] && [ "$(basename "$file")" != "sitemap-index.xml" ] && [ "$(basename "$file")" != "sitemap-0.xml" ]; then
            cp "$file" ../public/
            echo "✅ Updated $(basename "$file")"
        fi
    done
    
    echo ""
    echo "🎉 Complete deployment finished!"
    echo "📁 All files deployed to ../public/"
    echo "🚀 Landing folder is now completely self-contained"
    echo ""
    echo "Deployed:"
    echo "  ✅ HTML pages (index.html, about.html, etc.)"
    echo "  ✅ CSS and JS assets (_astro/)"
    echo "  ✅ Images and assets (ALL images from landing/assets/images/)"
    echo "  ✅ Root-level files (favicon.ico, manifest, etc.)"
    echo "  ✅ JavaScript files (js/)"
    echo "  ✅ Sitemap files"
    echo ""
    echo "🚀 Build and deployment complete!"
    echo "📋 All assets processed by Astro and deployed correctly"
    echo "   Check ../public/assets/ for images and other assets"
    
else
    echo "❌ Build failed!"
    exit 1
fi