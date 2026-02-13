import {
    FaRegBell,
    FaUsersCog,
    FaServicestack,
    FaChartPie,
    FaCog,
    FaFileInvoice,
    FaTools,
    FaRegCircle,
    FaTable,
    FaRegEdit,
    FaCheck,
    FaCalendarAlt,
    FaUsers,
    FaFileInvoiceDollar,
    FaChartLine,
    FaMedal,
    FaMapMarkedAlt,
    FaChartBar,
} from 'react-icons/fa';
import { IoIosHome, IoIosSearch, IoMdClose } from "react-icons/io";
import { CgPlayListAdd } from "react-icons/cg";
import {
    IoReceipt,
    IoCalendarOutline,
    IoChevronDownCircleOutline,
    IoChevronUpCircleOutline,
    IoChatbubblesOutline,
    IoCheckmark,
    IoClose,
    IoFilterOutline } from "react-icons/io5";
import { GrTransaction } from "react-icons/gr";
import { TbDeviceSim, TbBasketPlus, TbHomeStats, TbReport, TbHourglass } from "react-icons/tb";
import {
    MdAlarm,
    MdOutlinePhoneAndroid,
    MdBroadcastOnHome,
    MdOutlineSwitchAccount,
    MdTrendingUp,
    MdAccountBalance,
    MdRequestQuote,
    MdWarning,
} from 'react-icons/md';
import { AiFillApple } from 'react-icons/ai';
import { LuDatabase } from "react-icons/lu";
import { BiLinkExternal } from "react-icons/bi";
import { ImFilePdf } from "react-icons/im";
import { RiFileExcel2Line } from "react-icons/ri";
import { FiChevronsRight } from "react-icons/fi";


import { IconType } from 'react-icons';

interface IconLibrary {
    [key: string]: IconType;
}

interface IconLibraries {
    fa: IconLibrary;
    md: IconLibrary;
    tb: IconLibrary;
    gr: IconLibrary;
    io: IconLibrary;
    lu: IconLibrary;
    ai: IconLibrary;
    bi: IconLibrary;
    io5: IconLibrary;
    mi: IconLibrary;
    ri: IconLibrary;
    cg:IconLibrary;
    fi: IconLibrary;
}

const iconLibraries: IconLibraries = {
    fa: {
        FaRegBell,
        FaUsersCog,
        FaServicestack,
        FaChartPie,
        FaCog,
        FaFileInvoice,
        FaTools,
        FaRegCircle,
        FaTable,
        FaRegEdit, // added edit icon
        FaCheck ,   // added tick icon
        FaCalendarAlt,
        FaUsers,
        FaFileInvoiceDollar,
        FaChartLine,
        FaMedal,
        FaMapMarkedAlt,
        FaChartBar
    },
    md: {
        MdAlarm,
        MdOutlinePhoneAndroid,
        MdBroadcastOnHome,
        MdOutlineSwitchAccount,
        MdTrendingUp,
        MdAccountBalance,
        MdRequestQuote,
        MdWarning
    },
    tb: {
        TbDeviceSim,
        TbBasketPlus,
        TbHomeStats,
        TbReport,
        TbHourglass
    },
    gr: {
        GrTransaction
    },
    io: {
        IoIosHome,
        IoIosSearch,
        IoMdClose
    },
    lu: {
        LuDatabase
    },
    ai: {
        AiFillApple
    },
    bi: {
        BiLinkExternal
    },
    io5:{
        IoReceipt,
        IoCalendarOutline,
        IoChevronDownCircleOutline,
        IoChevronUpCircleOutline,
        IoChatbubblesOutline,
        IoCheckmark,
        IoClose,
        IoFilterOutline
    },
    mi:{
        ImFilePdf
    },
    ri:{
        RiFileExcel2Line
    },
    cg:{
        CgPlayListAdd
    },
    fi:{
        FiChevronsRight
    }
};

export default iconLibraries;
