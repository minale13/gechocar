export type LotteryType = 'IVECO' | 'Isuzu' | 'Vitz';

export type Lottery = {
  id: string;
  title: string;
  vehicleType: LotteryType;
  price: number;
  totalTickets: number;
  image: string;
  countDown: string;
};

export const lotteries: Lottery[] = [
  {
    id: 'iveco',
    title: '1ኛ ዕጣ',
    vehicleType: 'IVECO',
    price: 3000,
    totalTickets: 3000,
    image: 'https://images.unsplash.com/photo-1601584115197-04ecc0da31d7?auto=format&fit=crop&w=900&q=80',
    countDown: '02:14:36',
  },
  {
    id: 'isuzu',
    title: '2ኛ ዕጣ',
    vehicleType: 'Isuzu',
    price: 3000,
    totalTickets: 3000,
    image: 'https://images.unsplash.com/photo-1553440569-bcc63803a83d?auto=format&fit=crop&w=900&q=80',
    countDown: '03:21:10',
  },
  {
    id: 'vitz',
    title: '3ኛ ዕጣ',
    vehicleType: 'Vitz',
    price: 3000,
    totalTickets: 3000,
    image: 'https://images.unsplash.com/photo-1492144534655-ae79c964c9d7?auto=format&fit=crop&w=900&q=80',
    countDown: '01:52:44',
  },
];
