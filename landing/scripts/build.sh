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

# Run Astro build (builds to ./dist)
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
    
    # Copy all Astro-generated assets (CSS, JS, images)
    if [ -d "dist/_astro" ]; then
        rm -rf ../public/_astro 2>/dev/null || true
        cp -r dist/_astro ../public/
        echo "✅ Updated Astro CSS and JS assets"
    fi
    
    # Copy any other assets from public directory
    if [ -d "dist/assets" ]; then
        rm -rf ../public/assets 2>/dev/null || true
        cp -r dist/assets ../public/
        echo "✅ Updated assets directory"
    fi
    
    # Copy any JS files
    if [ -d "dist/js" ]; then
        rm -rf ../public/js 2>/dev/null || true
        cp -r dist/js ../public/
        echo "✅ Updated JS directory"
    fi
    
    # Copy sitemap
    if [ -f "dist/sitemap-index.xml" ]; then
        cp dist/sitemap-index.xml ../public/
        echo "✅ Updated sitemap"
    fi
    
    if [ -f "dist/sitemap-0.xml" ]; then
        cp dist/sitemap-0.xml ../public/
        echo "✅ Updated sitemap files"
    fi
    
    echo ""
    echo "🎉 Complete deployment finished!"
    echo "📁 All files deployed to ../public/"
    echo "🚀 Landing folder is now completely self-contained"
    echo ""
    echo "Deployed:"
    echo "  ✅ HTML pages (index.html, about.html, etc.)"
    echo "  ✅ CSS and JS assets (_astro/)"
    echo "  ✅ Images and assets (assets/)"
    echo "  ✅ JavaScript files (js/)"
    echo "  ✅ Sitemap files"
    echo ""
    echo "🚀 You can now test your complete site!"
    
else
    echo "❌ Build failed!"
    exit 1
fi#!/bin/bash

# Build script for Quasar Landing Pages
# This script builds the Astro site and outputs to the public folder

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

# Copy existing assets from the main public folder
echo "📁 Copying existing assets..."
mkdir -p public/css
mkdir -p public/assets
mkdir -p public/js

# Copy CSS files
if [ -f "../public/css/styles.css" ]; then
    cp ../public/css/styles.css public/css/
    echo "✅ Copied styles.css"
fi

if [ -f "../public/css/animations.css" ]; then
    cp ../public/css/animations.css public/css/
    echo "✅ Copied animations.css"
fi

# Copy assets directory
if [ -d "../public/assets" ]; then
    cp -r ../public/assets/* public/assets/ 2>/dev/null || true
    echo "✅ Copied assets directory"
fi

# Copy JavaScript files
if [ -d "../public/js" ]; then
    cp -r ../public/js/* public/js/ 2>/dev/null || true
    echo "✅ Copied JavaScript files"
fi

# Copy other common files
for file in "../public/favicon.ico" "../public/*.png" "../public/*.jpg" "../public/*.svg" "../public/*.webmanifest"; do
    if [ -f "$file" ]; then
        cp "$file" public/ 2>/dev/null || true
    fi
done

# Run Astro build
echo "🔨 Building Astro site..."
npm run build

# Check if build was successful
if [ $? -eq 0 ]; then
    echo "✅ Build completed successfully!"
    echo "📁 Static files are now in the ../public directory"
    echo ""
    echo "🚀 You can now deploy the public folder to your hosting service"
    echo "   or serve it locally with: npx serve ../public"
else
    echo "❌ Build failed!"
    exit 1
fi