
// Mock Data for Tam Korea Platform
// Used to simulate backend data until Airtable integration
import udaeRibsImage from '../assets/images/udae_ribs.jpg';
import dianpingLogo from '../assets/images/dianping_logo.png';
import xhsLogo from '../assets/images/xhs_logo.png';
import instagramLogo from '../assets/images/instagram_logo.png';

export const campaigns = [
    {
        id: 1,
        title: "[제주] 제주 우대 노형본점 - 프리미엄 우대갈비 / 토마호크 체험단",
        location: "제주 제주시 노연로 39 1층",
        platforms: ['dianping', 'xhs'], // Dazhongdianping + Xiaohongshu
        status: "recruiting",
        dDay: 15,
        applicants: 0, // Not used but keeping for structure
        maxApplicants: 10,
        category: "맛집/카페",
        imageUrl: udaeRibsImage,
        description: "고품질의 프리미엄 블랙 앵거스 비프만을 고집하는 우대 노형본점에서 샤오홍슈/따중디엔핑 체험단을 모집합니다.",
        offer: "우대갈비 or 토마호크 + 볶음밥"
    },
    {
        id: 2,
        title: "[서울] 탬버린즈 플래그십 스토어 방문기",
        location: "서울 강남구",
        platforms: ['xhs'],
        status: "recruiting",
        dDay: 5,
        applicants: 45,
        maxApplicants: 10,
        category: "뷰티/패션",
        imageUrl: "https://images.unsplash.com/photo-1596462502278-27bfdd403348?auto=format&fit=crop&q=80&w=800",
        description: "감각적인 향과 공간, 탬버린즈 신사 플래그십 스토어 체험단."
    },
    {
        id: 3,
        title: "[부산] 해운대 블루라인파크 스카이캡슐",
        location: "부산 해운대구",
        platforms: ['instagram'],
        status: "recruiting",
        dDay: 1,
        applicants: 8,
        maxApplicants: 3,
        category: "숙박/여행",
        imageUrl: "https://images.unsplash.com/photo-1635926744884-6351724acdc7?auto=format&fit=crop&q=80&w=800",
        description: "해운대 바다를 한눈에 담는 스카이캡슐 탑승 체험."
    },
    {
        id: 4,
        title: "[제주] 아르떼뮤지엄 미디어아트 체험",
        location: "제주 제주시",
        platforms: ['xhs'],
        status: "closed",
        dDay: 0,
        applicants: 156,
        maxApplicants: 20,
        category: "숙박/여행",
        imageUrl: "https://images.unsplash.com/photo-1545959553-62580a8df069?auto=format&fit=crop&q=80&w=800",
        description: "몰입형 미디어아트의 정수, 아르떼뮤지엄 제주."
    },
    {
        id: 5,
        title: "[서울] 런던베이글뮤지엄 도산점 웨이팅 체험",
        location: "서울 강남구",
        platforms: ['xhs'],
        status: "recruiting",
        dDay: 7,
        applicants: 89,
        maxApplicants: 5,
        category: "맛집/카페",
        imageUrl: "https://images.unsplash.com/photo-1626202163901-49b0e2714207?auto=format&fit=crop&q=80&w=800",
        description: "오픈런 필수 핫플, 런던베이글뮤지엄을 줄 서지 않고 체험하세요."
    },
    {
        id: 6,
        title: "[제주] 제주신화월드 랜딩관 숙박권",
        location: "제주 서귀포시",
        platforms: ['instagram'],
        status: "recruiting",
        dDay: 10,
        applicants: 230,
        maxApplicants: 2,
        category: "숙박/여행",
        imageUrl: "https://images.unsplash.com/photo-1618773928121-c32242e63f39?auto=format&fit=crop&q=80&w=800",
        description: "제주 최대 복합리조트 제주신화월드에서의 1박."
    }
];

export const reviews = [
    {
        id: 1,
        campaignTitle: "[제주] 애월 카페 노티드",
        influencer: "WangHong_Lisa",
        platform: "xhs",
        imageUrl: "https://images.unsplash.com/photo-1554118811-1e0d58224f24?auto=format&fit=crop&q=80&w=800",
        likes: 1240,
        content: "제주 애월에서 만난 인생 도넛! 뷰도 너무 예쁘고 도넛도 맛있어요. #제주카페 #노티드"
    },
    {
        id: 2,
        campaignTitle: "[서울] 젠틀몬스터 하우스 도산",
        influencer: "K_Traveler",
        platform: "instagram",
        imageUrl: "https://images.unsplash.com/photo-1516961642222-7d8fa5f45001?auto=format&fit=crop&q=80&w=800",
        likes: 850,
        content: "공간 자체가 예술이었던 젠틀몬스터 하우스 도산. 선글라스도 힙하고 포토존도 많아요."
    },
    {
        id: 3,
        campaignTitle: "[부산] 광안리 요트 투어",
        influencer: "Busan_Lover",
        platform: "xhs",
        imageUrl: "https://images.unsplash.com/photo-1569263979104-865ab7dd6038?auto=format&fit=crop&q=80&w=800",
        likes: 3400,
        content: "광안대교 야경을 보며 즐기는 요트 투어, 정말 낭만적이었어요! 불꽃놀이도 최고!"
    },
    {
        id: 4,
        campaignTitle: "[제주] 우도 전기차 투어",
        influencer: "Jeju_Vibes",
        platform: "instagram",
        imageUrl: "https://images.unsplash.com/photo-1540206395-688085723adb?auto=format&fit=crop&q=80&w=800",
        likes: 920,
        content: "우도 한 바퀴 전기차로 도는데 너무 시원하고 좋았습니다. 땅콩 아이스크림도 필수!"
    }
];
