
// Mock Data for Tam Korea Platform
// Used to simulate backend data until Airtable integration
import udaeRibsImage from '../assets/images/udae_ribs.jpg';
import dianpingLogo from '../assets/images/dianping_logo.png';
import xhsLogo from '../assets/images/xhs_logo.png';
import instagramLogo from '../assets/images/instagram_logo.png';

export const campaigns = [
    {
        id: 1,
        title: "[서울 강남] 우대본가 - 프리미엄 우대갈비 / 토마호크 체험단",
        location: "서울 강남구",
        platforms: ['dianping', 'xhs'], // Dazhongdianping + Xiaohongshu
        status: "recruiting",
        dDay: 15,
        applicants: 0, // Not used but keeping for structure
        maxApplicants: 10,
        category: "맛집/카페",
        imageUrl: udaeRibsImage,
        description: "고품질의 프리미엄 블랙 앵거스 비프만을 고집하는 우대본가에서 샤오홍슈/따중디엔핑 체험단을 모집합니다.",
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
        title: "[부산] 해운대 스카이클럽 체험",
        location: "부산 해운대구",
        platforms: ['xhs'],
        status: "closed",
        dDay: 0,
        applicants: 156,
        maxApplicants: 20,
        category: "숙박/여행",
        imageUrl: "https://images.unsplash.com/photo-1545959553-62580a8df069?auto=format&fit=crop&q=80&w=800",
        description: "탁 트인 오션뷰와 프리미엄 라운지가 있는 해운대 스카이클럽."
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
        title: "[서울] 시그니엘 서울 숙박권",
        location: "서울 송파구",
        platforms: ['instagram'],
        status: "recruiting",
        dDay: 10,
        applicants: 230,
        maxApplicants: 2,
        category: "숙박/여행",
        imageUrl: "https://images.unsplash.com/photo-1618773928121-c32242e63f39?auto=format&fit=crop&q=80&w=800",
        description: "최고의 뷰를 자랑하는 시그니엘 프리미어룸에서의 1박."
    }
];

export const reviews = [
    {
        id: 1,
        campaignTitle: "[서울 연남] 카페 하이웨스트",
        influencer: "WangHong_Lisa",
        platform: "xhs",
        imageUrl: "https://images.unsplash.com/photo-1554118811-1e0d58224f24?auto=format&fit=crop&q=80&w=800",
        likes: 1240,
        content: "연남동에서 만난 인생 디저트! 빈티지한 인테리어도 너무 예쁘고 맛있어요. #서울카페 #하이웨스트"
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
        campaignTitle: "[제주] 9.81 파크 액티비티",
        influencer: "Jeju_Vibes",
        platform: "instagram",
        imageUrl: "https://images.unsplash.com/photo-1540206395-688085723adb?auto=format&fit=crop&q=80&w=800",
        likes: 920,
        content: "무동력 카트 타며 즐기는 제주도 액티비티 끝판왕! 너무 스릴 넘치고 재밌어요!"
    }
];
