// Utility function to transform relative image paths to full URLs
const BASE_URL = process.env.BASE_URL;

function transformImageUrl(imagePath) {
  if (!imagePath) return null;
  if (imagePath.startsWith('http://') || imagePath.startsWith('https://')) {
    return imagePath;
  }
  if (imagePath.startsWith('/uploads/')) {
    return `${BASE_URL}${imagePath}`;
  }
  return imagePath;
}

function transformUserProfile(user) {
  if (!user) return user;
  const userObj = user.toObject ? user.toObject() : { ...user };
  if (userObj.profileImage) {
    userObj.profileImage = transformImageUrl(userObj.profileImage);
  }
  return userObj;
}

function transformTutorData(tutor) {
  if (!tutor) return tutor;
  const tutorObj = tutor.toObject ? tutor.toObject() : { ...tutor };
  if (tutorObj.profileImage) {
    tutorObj.profileImage = transformImageUrl(tutorObj.profileImage);
  }
  if (tutorObj.subjects && Array.isArray(tutorObj.subjects)) {
    tutorObj.subjects = tutorObj.subjects.map(subjectEntry => {
      if (subjectEntry.subject && subjectEntry.subject.imageUrl) {
        subjectEntry.subject.imageUrl = transformImageUrl(subjectEntry.subject.imageUrl);
      }
      return subjectEntry;
    });
  }
  return tutorObj;
}

module.exports = {
  transformImageUrl,
  transformUserProfile,
  transformTutorData,
}; 