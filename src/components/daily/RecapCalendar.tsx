'use client';

import Badge from '@mui/material/Badge';
import { DateCalendar } from '@mui/x-date-pickers/DateCalendar';
import { PickerDay, PickerDayProps } from '@mui/x-date-pickers/PickerDay';
import { format } from 'date-fns';

type RecapDayProps = PickerDayProps & { recapDays?: Set<string> };

function RecapDay(props: RecapDayProps) {
	const { recapDays, day, outsideCurrentMonth, ...other } = props;
	const key = format(day, 'yyyy-MM-dd');
	const hasRecap = !outsideCurrentMonth && !!recapDays?.has(key);

	return (
		<Badge key={key} overlap="circular" variant="dot" color="primary" invisible={!hasRecap}>
			<PickerDay {...other} day={day} outsideCurrentMonth={outsideCurrentMonth} />
		</Badge>
	);
}

export default function RecapCalendar({
	recapDays,
	onPickDay,
	onMonthChange,
}: {
	recapDays: Set<string>;
	onPickDay: (date: Date) => void;
	onMonthChange: (date: Date) => void;
}) {
	return (
		<DateCalendar
			views={['day']}
			onChange={(value) => value && onPickDay(value)}
			onMonthChange={onMonthChange}
			slots={{ day: RecapDay }}
			slotProps={{ day: { recapDays } as unknown as PickerDayProps }}
			sx={{
				width: '100%',
				maxWidth: 420,
				'& .MuiPickersCalendarHeader-root': { pl: 2, pr: 1 },
			}}
		/>
	);
}
