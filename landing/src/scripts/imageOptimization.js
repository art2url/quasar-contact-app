// Image loading optimization
if ('loading' in HTMLImageElement.prototype) {
  // Native lazy loading supported
  const images = document.querySelectorAll('img[loading="lazy"]');
  images.forEach(img => {
    img.style.transition = 'opacity 0.3s ease';
    img.onload = () => {
      img.style.opacity = '1';
    };
  });
}

// Connection-aware loading
if ('connection' in navigator) {
  const connection = navigator.connection;
  if (connection.effectiveType === '2g' || connection.effectiveType === 'slow-2g') {
    document.documentElement.classList.add('slow-connection');
  }
}
