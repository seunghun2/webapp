// Calculate D-Day
function calculateDDay(deadlineStr) {
  const deadline = new Date(deadlineStr);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  deadline.setHours(0, 0, 0, 0);
  
  const diffTime = deadline - today;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  
  if (diffDays < 0) {
    return { text: '마감', class: 'bg-gray-400', days: diffDays };
  } else if (diffDays === 0) {
    return { text: 'D-Day', class: 'bg-red-500', days: 0 };
  } else if (diffDays <= 7) {
    return { text: `D-${diffDays}`, class: 'bg-red-500', days: diffDays };
  } else if (diffDays <= 30) {
    return { text: `D-${diffDays}`, class: 'bg-orange-500', days: diffDays };
  } else {
    return { text: `D-${diffDays}`, class: 'bg-blue-500', days: diffDays };
  }
}

// Format margin display
function formatMargin(margin, rate) {
  if (!margin || margin === 0) return null;
  
  const sign = margin > 0 ? '+' : '';
  const color = margin > 0 ? 'text-red-500' : 'text-blue-500';
  
  return {
    text: `${sign}${margin.toFixed(1)}억 (${sign}${rate.toFixed(1)}%)`,
    color: color
  };
}

// Open map
function openMap(address, lat, lng) {
  // Kakao Map or Naver Map
  if (lat && lng) {
    window.open(`https://map.kakao.com/link/map/${address},${lat},${lng}`, '_blank');
  } else {
    window.open(`https://map.kakao.com/link/search/${address}`, '_blank');
  }
}

// Format price
function formatPrice(price) {
  if (!price || price === 0) return '-';
  return `${price.toFixed(1)}억`;
}
