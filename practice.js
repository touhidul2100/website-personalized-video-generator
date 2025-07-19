
const websiteURL="http://www.maica.com.my"

const videoIdentifier = `${websiteURL.replace(/[^a-zA-Z0-9]/g, '_')}`;
console.log(videoIdentifier);