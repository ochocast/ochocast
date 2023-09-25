import { FC } from 'react';
import { ChangeEvent, FormEvent, useState } from 'react'
import './events.css';

import Header from '../../components/Header/Header';
import Button from '../../components/buttons/button/button';
import Modal from '../../components/modal/modal';
import TextBox from '../../components/TextBox/TextBox';
import TextArea from '../../components/TextArea/TextArea';
import { Option } from '../../components/SelectBox/SelectBox';
import { SelectBox } from '../../components/SelectBox/SelectBox';

interface eventsProps {}

const categories = ['BBL', 'Conférence'];

const EventsPage: FC<eventsProps> = () => {
    const [isOpen, setisOpen] = useState(false);
    const toggle = () => { setisOpen(!isOpen);};

    const [name, setName] = useState('')
    const [errorName, setErrorName] = useState(false)

    const [description, setDescription] = useState('')
    const [errorDescription, setErrorDescription] = useState(false)

    const [categoryValue, setCategoryValue] = useState('');

    const [date, setDate] = useState('');

    const [message, setMessage] = useState("");
    
    const handleSelectChange = (event: ChangeEvent<HTMLSelectElement>) => {
        setCategoryValue(event.target.value);
    };

    const options: Option[] = [
        { label: 'Select...', value: '' },
        ...categories.map((category) => ({ label: category, value: category })),
      ];

    const handleNameChange = (e: ChangeEvent<HTMLInputElement>) => {
      setName(e.target.value)
    }
    const handleDescriptionChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
        setDescription(e.target.value)
    }

    const handleDateChange = (e: ChangeEvent<HTMLInputElement>) => {
        setDate(e.target.value)
    }

    const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault()
        if (!name.trim()) {
        setErrorName(true)
        }
        if (!description.trim()) {
        setErrorDescription(true)
        }
        try {
            let res = await fetch("http://localhost:3001/api/events", {
                method: "POST",
                mode: "cors",
                body: JSON.stringify({
                    name: name,
                    date: date,
                    description: description,
                    category: categoryValue,
                    tags: [],
                    creator: 1,
                    isPrivate: "true",
                    imageSlug: ""
                }),
            });
            let resJson = await res.json();
            if (res.status === 200) {
                setMessage("L'évènement a été créer");
                toggle();
            }
        } catch (error) {
            console.log(error)
            setMessage("L'évènement n'a pas pu être créer, une erreur est survenue");
        }
    }

    return (
    <div className="events">
        <Header/>
        <Button
            onClick={toggle}
            children = "Créer un évènement"
        />
        <Modal isOpen={isOpen} toggle={toggle}>
            <h1>Créer un nouvel évènement</h1>
            <form onSubmit={handleSubmit}>
                <div className="side-by-side">
                    <TextBox
                        type="text"
                        label="Nom de l'évènement"
                        placeholder="Mon évènement"
                        value={name}
                        name='name'
                        error={errorName}
                        onChange={handleNameChange}
                    />
                    <div className='input-wrapper'>
                        <label>Date de l'évènement</label>
                        <input type='date'  
                            name="date"
                            value={date}
                            min={new Date().toISOString().split('T')[0]}  
                            onChange={handleDateChange}
                            required
                        />
                    </div>
                    <SelectBox
                        title="Catégorie"
                        options={options}
                        value={categoryValue}
                        onChange={handleSelectChange}
                    />
                </div>
                <TextArea
                    label="Description de l'évènement"
                    placeholder="Description..."
                    value={description}
                    name='description'
                    error={errorDescription}
                    onChange={handleDescriptionChange}
                />
                <Button className="submit-button" type="submit">Créer l'évènement</Button>
                <div className="message">{message ? <p>{message}</p> : null}</div>
            </form>
        </Modal>
    </div>
)};

export default EventsPage;
